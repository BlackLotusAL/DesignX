import { randomUUID } from 'node:crypto';
import picomatch from 'picomatch';
import type {
  AnalysisTaskRecord,
  FindingRecord,
  ModelFinding,
  StartAnalysisInput,
  TaskDiagnostic,
} from '../../../shared/types';
import { DesignXError, toAppError } from '../../errors';
import type { WorkspaceStore } from '../../persistence/workspace-store';
import type {
  AnalysisFileContext,
  GitAnalysisInput,
  GitService,
} from '../git/git-service';
import type {
  KnowledgeService,
  LoadedKnowledgeVersion,
} from '../knowledge/knowledge-service';
import type { LogService } from '../logging/log-service';
import type { ModelConnection, ModelService } from '../model/model-service';

interface QueueEntry {
  store: WorkspaceStore;
  taskId: string;
}

interface AnalysisServiceOptions {
  git: GitService;
  knowledge: KnowledgeService;
  model: ModelService;
  connection: (store: WorkspaceStore) => Promise<ModelConnection>;
  log: (store: WorkspaceStore) => LogService;
  onTaskUpdated?: (task: AnalysisTaskRecord) => void;
  onRepositoryUpdated?: (repositoryId: string, store: WorkspaceStore) => Promise<void>;
}

const RANGE_LABELS: Record<StartAnalysisInput['range'], string> = {
  baseline: '上次成功分析 → 当前提交',
  current: '当前代码基线',
  recent10: '最近 10 个提交',
};

function elapsedLabel(startedAt: string): string {
  const milliseconds = Math.max(0, Date.now() - new Date(startedAt).getTime());
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1000))}s`;
  return `${Math.round(milliseconds / 60_000)}m`;
}

function diagnostic(
  stage: string,
  error: unknown,
  batch?: number,
): TaskDiagnostic {
  const appError = toAppError(error, stage);
  return {
    timestamp: new Date().toISOString(),
    stage,
    code: appError.code,
    message: appError.message,
    retryable: appError.retryable,
    ...(batch === undefined ? {} : { batch }),
  };
}

function numberDiff(diff: string): string {
  const output: string[] = [];
  let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      output.push(line);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
      output.push(line);
      continue;
    }
    if (line.startsWith('-')) {
      output.push(`     ${line}`);
      continue;
    }
    if (line.startsWith('+') || line.startsWith(' ')) {
      output.push(`${String(newLine).padStart(5, ' ')} ${line}`);
      newLine += 1;
      continue;
    }
    output.push(line);
  }
  return output.join('\n');
}

function keywordScore(
  file: AnalysisFileContext,
  focus: string,
  version: LoadedKnowledgeVersion,
  reference: LoadedKnowledgeVersion['references'][number],
): number {
  const fileText = `${file.path} ${file.language}`.toLowerCase();
  const focusWords = focus
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((word) => word.length >= 2);
  let score = 0;
  if (picomatch(version.manifest.scope, { dot: true })(file.path)) score += 8;
  for (const keyword of reference.keywords) {
    if (fileText.includes(keyword.toLowerCase())) score += 3;
    if (focusWords.includes(keyword.toLowerCase())) score += 2;
  }
  if (reference.title.toLowerCase().includes(file.language)) score += 2;
  return score;
}

function selectReferences(
  file: AnalysisFileContext,
  focus: string,
  versions: LoadedKnowledgeVersion[],
): Array<{
  version: LoadedKnowledgeVersion;
  reference: LoadedKnowledgeVersion['references'][number];
}> {
  const candidates = versions.flatMap((version) =>
    version.references.map((reference) => ({
      version,
      reference,
      score: keywordScore(file, focus, version, reference),
    })),
  );
  const relevant = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (relevant.length > 0) return relevant;
  return candidates.slice(0, 2);
}

function buildPrompt(
  gitInput: GitAnalysisInput,
  file: AnalysisFileContext,
  focus: string,
  versions: LoadedKnowledgeVersion[],
): string {
  const selected = selectReferences(file, focus, versions);
  const knowledgeText = selected
    .map(({ version, reference }) =>
      [
        `packageId: ${version.manifest.packageId}`,
        `version: ${version.manifest.version}`,
        `type: ${version.manifest.type}`,
        `section: ${reference.title}`,
        `referencePath: ${reference.referencePath}`,
        `sourcePath: ${reference.sourcePath}`,
        `sourceLocation: ${reference.sourceLocation.label}`,
        reference.markdown.slice(0, 8_000),
      ].join('\n'),
    )
    .join('\n\n--- KNOWLEDGE ---\n\n')
    .slice(0, 18_000);
  const diffText = numberDiff(file.diff).slice(0, 38_000);
  return [
    `任务关注点：${focus || '无额外关注点'}`,
    `Commit：${gitInput.toCommit}`,
    `文件：${file.path}`,
    `语言：${file.language}`,
    '',
    '代码 Diff（每行左侧为当前版本行号；删除行没有当前行号）：',
    diffText,
    '',
    '允许引用的知识证据：',
    knowledgeText,
    '',
    '仅报告这个文件中可以由上述知识直接支持的问题。没有问题时返回空 findings。',
  ].join('\n');
}

function findingCodeLines(file: AnalysisFileContext, line: number) {
  const lines = file.content.split(/\r?\n/);
  const start = Math.max(1, line - 3);
  const end = Math.min(lines.length, line + 3);
  return lines.slice(start - 1, end).map((content, index) => ({
    number: start + index,
    content,
    highlight: start + index === line,
  }));
}

export class AnalysisService {
  private readonly queue: QueueEntry[] = [];
  private running = 0;
  private readonly activeRepositoryKeys = new Set<string>();

  constructor(private readonly options: AnalysisServiceOptions) {}

  hasActiveTasks(): boolean {
    return this.running > 0 || this.queue.length > 0;
  }

  private repositoryKey(store: WorkspaceStore, repositoryId: string): string {
    return `${store.root}::${repositoryId}`;
  }

  async start(
    store: WorkspaceStore,
    input: StartAnalysisInput,
  ): Promise<AnalysisTaskRecord> {
    const repository = await store.repository(input.repositoryId);
    const activeKey = this.repositoryKey(store, input.repositoryId);
    const persistedActive = (await store.tasks()).find(
      (task) =>
        task.repositoryId === input.repositoryId &&
        (task.status === 'queued' || task.status === 'running'),
    );
    if (this.activeRepositoryKeys.has(activeKey) || persistedActive) {
      throw new DesignXError({
        code: 'ANALYSIS_ALREADY_ACTIVE',
        stage: 'analysis-start',
        message: `${repository.name} 已有排队中或运行中的任务。`,
        retryable: false,
        detail: persistedActive?.id,
      });
    }
    const versions = await Promise.all(
      input.knowledgeVersionIds.map((id) => store.resolveKnowledgeVersionId(id)),
    );
    const now = new Date().toISOString();
    const task: AnalysisTaskRecord = {
      schemaVersion: 1,
      id: randomUUID(),
      repositoryId: repository.id,
      repositoryName: repository.name,
      branch: repository.branch,
      range: input.range,
      rangeLabel: RANGE_LABELS[input.range],
      knowledge: versions.map((version) => `${version.name} ${version.version}`),
      knowledgeVersionIds: input.knowledgeVersionIds,
      status: 'queued',
      stage: '准备工作区',
      progress: 0,
      findingCount: null,
      duration: '< 1m',
      startedAt: now,
      focus: input.focus,
      diagnostics: [],
    };
    await Promise.all([
      store.saveTask(task),
      store.saveTaskInput(task.id, input),
      store.saveFindings(task.id, []),
    ]);
    this.activeRepositoryKeys.add(activeKey);
    this.queue.push({ store, taskId: task.id });
    this.options.onTaskUpdated?.(task);
    void this.drain();
    return task;
  }

  async retry(
    store: WorkspaceStore,
    taskId: string,
  ): Promise<AnalysisTaskRecord> {
    const task = await store.task(taskId);
    if (task.status !== 'failed' && task.status !== 'partial') {
      throw new DesignXError({
        code: 'TASK_NOT_RETRYABLE',
        stage: 'analysis-retry',
        message: '只有失败或部分失败的任务可以重新运行。',
        retryable: false,
      });
    }
    const activeKey = this.repositoryKey(store, task.repositoryId);
    if (this.activeRepositoryKeys.has(activeKey)) {
      throw new DesignXError({
        code: 'ANALYSIS_ALREADY_ACTIVE',
        stage: 'analysis-retry',
        message: `${task.repositoryName} 已有运行中的任务。`,
        retryable: false,
      });
    }
    const updated: AnalysisTaskRecord = {
      ...task,
      status: 'queued',
      stage: '准备工作区',
      progress: 0,
      findingCount: null,
      duration: '< 1m',
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      error: undefined,
      diagnostics: [],
    };
    await Promise.all([store.saveTask(updated), store.saveFindings(task.id, [])]);
    this.activeRepositoryKeys.add(activeKey);
    this.queue.push({ store, taskId });
    this.options.onTaskUpdated?.(updated);
    void this.drain();
    return updated;
  }

  private async drain(): Promise<void> {
    while (this.running < 2 && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry) return;
      this.running += 1;
      void this.execute(entry)
        .catch(() => undefined)
        .finally(() => {
          this.running -= 1;
          void this.drain();
        });
    }
  }

  private async updateTask(
    store: WorkspaceStore,
    task: AnalysisTaskRecord,
    patch: Partial<AnalysisTaskRecord>,
  ): Promise<AnalysisTaskRecord> {
    const updated = { ...task, ...patch };
    await store.saveTask(updated);
    this.options.onTaskUpdated?.(updated);
    return updated;
  }

  private async validateFinding(
    store: WorkspaceStore,
    task: AnalysisTaskRecord,
    gitInput: GitAnalysisInput,
    modelFinding: ModelFinding,
    versions: LoadedKnowledgeVersion[],
  ): Promise<FindingRecord | null> {
    const file = gitInput.files.find((item) => item.path === modelFinding.file);
    if (!file || modelFinding.line > file.lineCount) return null;
    if (
      !versions.some(
        (version) =>
          version.manifest.packageId === modelFinding.knowledge.packageId &&
          version.manifest.version === modelFinding.knowledge.version,
      )
    ) {
      return null;
    }
    const [codeValid, knowledgeManifest] = await Promise.all([
      this.options.git.verifyCodeLocation(
        store,
        task.repositoryId,
        gitInput.toCommit,
        modelFinding.file,
        modelFinding.line,
      ),
      this.options.knowledge.verifyEvidence(store, modelFinding.knowledge),
    ]);
    if (!codeValid || !knowledgeManifest) return null;
    return {
      schemaVersion: 1,
      id: randomUUID(),
      taskId: task.id,
      repositoryId: task.repositoryId,
      repositoryName: task.repositoryName,
      title: modelFinding.title,
      type: modelFinding.type,
      severity: modelFinding.severity,
      confidence: modelFinding.confidence,
      status: 'open',
      file: modelFinding.file,
      line: modelFinding.line,
      lineRange: `${Math.max(1, modelFinding.line - 3)}–${Math.min(
        file.lineCount,
        modelFinding.line + 3,
      )}`,
      symbol: modelFinding.symbol,
      commit: gitInput.toCommit,
      knownFact: modelFinding.knownFact,
      inference: modelFinding.inference,
      codeLines: findingCodeLines(file, modelFinding.line),
      knowledge: {
        packageId: knowledgeManifest.packageId,
        packageName: knowledgeManifest.name,
        version: knowledgeManifest.version,
        section: modelFinding.knowledge.section,
        excerpt: modelFinding.knowledge.excerpt,
        referencePath: modelFinding.knowledge.referencePath,
        sourcePath: modelFinding.knowledge.sourcePath,
        sourceLocation: modelFinding.knowledge.sourceLocation,
      },
      suggestions: modelFinding.suggestions,
    };
  }

  private async execute(entry: QueueEntry): Promise<void> {
    const { store, taskId } = entry;
    let task = await store.task(taskId);
    const activeKey = this.repositoryKey(store, task.repositoryId);
    const log = this.options.log(store);
    try {
      task = await this.updateTask(store, task, {
        status: 'running',
        stage: '准备工作区',
        progress: 8,
      });
      const input = await store.taskInput<StartAnalysisInput>(task.id);
      const versions = await Promise.all(
        input.knowledgeVersionIds.map((id) =>
          this.options.knowledge.loadVersion(store, id),
        ),
      );

      task = await this.updateTask(store, task, {
        stage: '读取 Git Diff',
        progress: 24,
      });
      const gitInput = await this.options.git.collectAnalysisInput(
        store,
        input.repositoryId,
        input.range,
        versions.map((version) => version.manifest.scope),
        input.focus,
      );
      task = await this.updateTask(store, task, {
        fromCommit: gitInput.fromCommit,
        toCommit: gitInput.toCommit,
        rangeLabel: gitInput.displayRange,
        stage: '选择知识',
        progress: 44,
      });

      const prompts = gitInput.files.map((file) =>
        buildPrompt(gitInput, file, input.focus, versions),
      );
      if (prompts.some((prompt) => prompt.length > 60_000)) {
        throw new DesignXError({
          code: 'MODEL_BATCH_LIMIT',
          stage: '选择知识',
          message: '单个模型批次超过 60,000 字符限制。',
          retryable: true,
        });
      }
      task = await this.updateTask(store, task, {
        stage: '模型分析',
        progress: prompts.length === 0 ? 82 : 55,
      });
      const connection = await this.options.connection(store);
      const findings: FindingRecord[] = [];
      let failedBatches = 0;
      for (let index = 0; index < prompts.length; index += 1) {
        try {
          const output = await this.options.model.analyze(connection, prompts[index]);
          for (const modelFinding of output.findings) {
            const finding = await this.validateFinding(
              store,
              task,
              gitInput,
              modelFinding,
              versions,
            );
            if (finding) {
              const duplicate = findings.some(
                (item) =>
                  item.file === finding.file &&
                  item.line === finding.line &&
                  item.title === finding.title,
              );
              if (!duplicate) findings.push(finding);
            } else {
              task.diagnostics.push({
                timestamp: new Date().toISOString(),
                stage: '结构校验',
                code: 'EVIDENCE_INSUFFICIENT',
                message: `批次 ${index + 1} 的一条结果缺少有效代码或知识证据，未进入发现列表。`,
                retryable: false,
                batch: index + 1,
              });
            }
          }
          await store.saveFindings(task.id, findings);
        } catch (error) {
          failedBatches += 1;
          task.diagnostics.push(diagnostic('模型分析', error, index + 1));
        }
        task = await this.updateTask(store, task, {
          progress:
            prompts.length === 0
              ? 82
              : Math.round(55 + ((index + 1) / prompts.length) * 27),
          diagnostics: task.diagnostics,
        });
      }

      task = await this.updateTask(store, task, {
        stage: '结构校验',
        progress: 88,
        diagnostics: task.diagnostics,
      });
      await store.saveFindings(task.id, findings);
      const finishedAt = new Date().toISOString();
      if (failedBatches > 0) {
        const status = failedBatches === prompts.length && findings.length === 0
          ? 'failed'
          : 'partial';
        task = await this.updateTask(store, task, {
          status,
          stage: status === 'failed' ? '模型分析失败' : '部分批次失败',
          progress: 100,
          findingCount: findings.length,
          duration: elapsedLabel(task.startedAt),
          finishedAt,
          error:
            status === 'failed'
              ? '所有模型批次均失败，请查看诊断并重新运行。'
              : '部分模型批次失败，已保留成功发现；分析基线未更新。',
          diagnostics: task.diagnostics,
        });
      } else {
        task = await this.updateTask(store, task, {
          status: 'completed',
          stage: '保存结果',
          progress: 100,
          findingCount: findings.length,
          duration: elapsedLabel(task.startedAt),
          finishedAt,
          error: undefined,
          diagnostics: task.diagnostics,
        });
        await this.options.git.commitBaseline(
          store,
          task.repositoryId,
          gitInput.toCommit,
        );
        await this.options.onRepositoryUpdated?.(task.repositoryId, store);
      }
      await log.append({
        taskId: task.id,
        repositoryId: task.repositoryId,
        stage: task.stage,
        durationMs: Date.now() - new Date(task.startedAt).getTime(),
        level: task.status === 'completed' ? 'info' : 'warn',
      });
    } catch (error) {
      const issue = diagnostic(task.stage, error);
      const failed = await this.updateTask(store, task, {
        status: 'failed',
        stage: issue.stage,
        progress: 100,
        findingCount: (await store.findingsForTask(task.id)).length,
        duration: elapsedLabel(task.startedAt),
        finishedAt: new Date().toISOString(),
        error: issue.message,
        diagnostics: [...task.diagnostics, issue],
      });
      await log.append({
        taskId: failed.id,
        repositoryId: failed.repositoryId,
        stage: failed.stage,
        durationMs: Date.now() - new Date(failed.startedAt).getTime(),
        errorCode: issue.code,
        level: 'error',
      });
    } finally {
      this.activeRepositoryKeys.delete(activeKey);
    }
  }
}
