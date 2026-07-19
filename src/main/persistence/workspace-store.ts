import { mkdir, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type {
  AnalysisTaskRecord,
  FindingRecord,
  KnowledgeDraftView,
  KnowledgePackageRecord,
  KnowledgeVersionRecord,
  RepositoryRecord,
  SettingsView,
  WorkspaceSnapshot,
} from '../../shared/types';
import { DesignXError } from '../errors';
import {
  pathInside,
  readJson,
  readJsonIfExists,
  validateWritableDirectory,
  writeJsonAtomic,
} from './atomic';

interface WorkspaceFile {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  settings: {
    apiUrl: string;
    model: string;
    timeout: number;
    structuredOutputModes: Record<string, 'json_schema' | 'json_object'>;
  };
}

export interface StoredKnowledgeDraft extends KnowledgeDraftView {
  schemaVersion: 1;
  references: KnowledgeDraftView['references'];
}

interface SnapshotOptions {
  credentialConfigured: boolean;
  gitAvailable: boolean;
  gitVersion?: string;
}

const DEFAULT_SETTINGS: WorkspaceFile['settings'] = {
  apiUrl: 'https://model.internal.example',
  model: 'enterprise-model',
  timeout: 120,
  structuredOutputModes: {},
};

async function listDirectories(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.endsWith('.tmp'))
      .map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

export class WorkspaceStore {
  readonly root: string;
  readonly designxDirectory: string;
  readonly repositoriesDirectory: string;
  readonly knowledgeDirectory: string;
  readonly tasksDirectory: string;
  private readonly workspaceFilePath: string;
  private workspaceFile: WorkspaceFile | null = null;

  constructor(
    root: string,
    private readonly developmentDefaults: Partial<WorkspaceFile['settings']> = {},
  ) {
    this.root = resolve(root);
    this.designxDirectory = join(this.root, '.designx');
    this.repositoriesDirectory = join(this.designxDirectory, 'repositories');
    this.knowledgeDirectory = join(this.designxDirectory, 'knowledge');
    this.tasksDirectory = join(this.designxDirectory, 'tasks');
    this.workspaceFilePath = join(this.designxDirectory, 'workspace.json');
  }

  async initialize(): Promise<void> {
    await validateWritableDirectory(this.root);
    await Promise.all([
      mkdir(this.repositoriesDirectory, { recursive: true }),
      mkdir(this.knowledgeDirectory, { recursive: true }),
      mkdir(this.tasksDirectory, { recursive: true }),
      mkdir(join(this.designxDirectory, 'logs'), { recursive: true }),
    ]);
    const existing = await readJsonIfExists<WorkspaceFile>(this.workspaceFilePath);
    if (existing) {
      if (existing.schemaVersion !== 1) {
        throw new DesignXError({
          code: 'UNSUPPORTED_WORKSPACE_SCHEMA',
          stage: 'workspace-bootstrap',
          message: '该工作区的数据版本不受当前 DesignX 支持。',
          retryable: false,
        });
      }
      this.workspaceFile = existing;
    } else {
      const now = new Date().toISOString();
      this.workspaceFile = {
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        settings: {
          ...DEFAULT_SETTINGS,
          ...this.developmentDefaults,
          structuredOutputModes: {},
        },
      };
      await this.saveWorkspaceFile();
    }
  }

  private requireWorkspaceFile(): WorkspaceFile {
    if (!this.workspaceFile) {
      throw new DesignXError({
        code: 'WORKSPACE_NOT_INITIALIZED',
        stage: 'workspace',
        message: '工作区尚未初始化。',
        retryable: true,
      });
    }
    return this.workspaceFile;
  }

  private async saveWorkspaceFile(): Promise<void> {
    const workspace = this.requireWorkspaceFile();
    workspace.updatedAt = new Date().toISOString();
    await writeJsonAtomic(this.workspaceFilePath, workspace);
  }

  async settings(credentialConfigured: boolean): Promise<SettingsView> {
    const settings = this.requireWorkspaceFile().settings;
    return {
      workspace: this.root,
      apiUrl: settings.apiUrl,
      model: settings.model,
      timeout: settings.timeout,
      credentialConfigured,
    };
  }

  async updateSettings(input: {
    apiUrl: string;
    model: string;
    timeout: number;
  }): Promise<void> {
    const workspace = this.requireWorkspaceFile();
    workspace.settings.apiUrl = input.apiUrl;
    workspace.settings.model = input.model;
    workspace.settings.timeout = input.timeout;
    await this.saveWorkspaceFile();
  }

  getModelSettings(): WorkspaceFile['settings'] {
    return structuredClone(this.requireWorkspaceFile().settings);
  }

  async cacheStructuredOutputMode(
    baseUrl: string,
    mode: 'json_schema' | 'json_object',
  ): Promise<void> {
    this.requireWorkspaceFile().settings.structuredOutputModes[baseUrl] = mode;
    await this.saveWorkspaceFile();
  }

  repositoryDirectory(repositoryId: string): string {
    return pathInside(this.repositoriesDirectory, repositoryId);
  }

  repositoryCheckout(repositoryId: string): string {
    return pathInside(this.repositoryDirectory(repositoryId), 'checkout');
  }

  repositoryMetadataPath(repositoryId: string): string {
    return pathInside(this.repositoryDirectory(repositoryId), 'repository.json');
  }

  knowledgePackageDirectory(packageId: string): string {
    return pathInside(this.knowledgeDirectory, packageId);
  }

  knowledgeDraftDirectory(packageId: string): string {
    return pathInside(this.knowledgePackageDirectory(packageId), 'draft');
  }

  knowledgeVersionDirectory(packageId: string, version: string): string {
    return pathInside(this.knowledgePackageDirectory(packageId), 'versions', version);
  }

  taskDirectory(taskId: string): string {
    return pathInside(this.tasksDirectory, taskId);
  }

  async repositories(): Promise<RepositoryRecord[]> {
    const ids = await listDirectories(this.repositoriesDirectory);
    const records = await Promise.all(
      ids.map((id) => readJson<RepositoryRecord>(this.repositoryMetadataPath(id))),
    );
    return records.sort((a, b) => b.lastSync.localeCompare(a.lastSync));
  }

  async repository(repositoryId: string): Promise<RepositoryRecord> {
    const record = await readJsonIfExists<RepositoryRecord>(
      this.repositoryMetadataPath(repositoryId),
    );
    if (!record) {
      throw new DesignXError({
        code: 'REPOSITORY_NOT_FOUND',
        stage: 'repository',
        message: '找不到指定代码仓。',
        retryable: false,
      });
    }
    return record;
  }

  async saveRepository(record: RepositoryRecord): Promise<void> {
    await writeJsonAtomic(this.repositoryMetadataPath(record.id), record);
  }

  async knowledgePackages(): Promise<KnowledgePackageRecord[]> {
    const ids = await listDirectories(this.knowledgeDirectory);
    const records = await Promise.all(
      ids.map((id) =>
        readJson<KnowledgePackageRecord>(
          pathInside(this.knowledgePackageDirectory(id), 'package.json'),
        ),
      ),
    );
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async knowledgePackage(packageId: string): Promise<KnowledgePackageRecord> {
    const record = await readJsonIfExists<KnowledgePackageRecord>(
      pathInside(this.knowledgePackageDirectory(packageId), 'package.json'),
    );
    if (!record) {
      throw new DesignXError({
        code: 'KNOWLEDGE_PACKAGE_NOT_FOUND',
        stage: 'knowledge',
        message: '找不到指定知识包。',
        retryable: false,
      });
    }
    return record;
  }

  async saveKnowledgePackage(record: KnowledgePackageRecord): Promise<void> {
    await writeJsonAtomic(
      pathInside(this.knowledgePackageDirectory(record.id), 'package.json'),
      record,
    );
  }

  async knowledgeDraft(packageId: string): Promise<StoredKnowledgeDraft> {
    const draft = await readJsonIfExists<StoredKnowledgeDraft>(
      pathInside(this.knowledgeDraftDirectory(packageId), 'draft.json'),
    );
    if (!draft) {
      throw new DesignXError({
        code: 'KNOWLEDGE_DRAFT_NOT_FOUND',
        stage: 'knowledge-draft',
        message: '该知识包没有可继续的草稿。',
        retryable: false,
      });
    }
    return draft;
  }

  async saveKnowledgeDraft(draft: StoredKnowledgeDraft): Promise<void> {
    await writeJsonAtomic(
      pathInside(this.knowledgeDraftDirectory(draft.packageId), 'draft.json'),
      draft,
    );
  }

  async knowledgeVersion(
    packageId: string,
    version: string,
  ): Promise<KnowledgeVersionRecord> {
    const manifest = await readJsonIfExists<KnowledgeVersionRecord>(
      pathInside(this.knowledgeVersionDirectory(packageId, version), 'manifest.json'),
    );
    if (!manifest) {
      throw new DesignXError({
        code: 'KNOWLEDGE_VERSION_NOT_FOUND',
        stage: 'knowledge-version',
        message: '找不到指定知识版本。',
        retryable: false,
      });
    }
    return manifest;
  }

  async resolveKnowledgeVersionId(
    versionId: string,
  ): Promise<KnowledgeVersionRecord> {
    const separator = versionId.lastIndexOf('@');
    if (separator <= 0) {
      throw new DesignXError({
        code: 'INVALID_KNOWLEDGE_VERSION_ID',
        stage: 'knowledge-selection',
        message: '知识版本标识无效。',
        retryable: false,
      });
    }
    return this.knowledgeVersion(
      versionId.slice(0, separator),
      versionId.slice(separator + 1),
    );
  }

  async tasks(): Promise<AnalysisTaskRecord[]> {
    const ids = await listDirectories(this.tasksDirectory);
    const records = await Promise.all(
      ids.map((id) =>
        readJson<AnalysisTaskRecord>(
          pathInside(this.taskDirectory(id), 'task.json'),
        ),
      ),
    );
    return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async task(taskId: string): Promise<AnalysisTaskRecord> {
    const record = await readJsonIfExists<AnalysisTaskRecord>(
      pathInside(this.taskDirectory(taskId), 'task.json'),
    );
    if (!record) {
      throw new DesignXError({
        code: 'TASK_NOT_FOUND',
        stage: 'analysis-task',
        message: '找不到指定分析任务。',
        retryable: false,
      });
    }
    return record;
  }

  async saveTask(record: AnalysisTaskRecord): Promise<void> {
    await writeJsonAtomic(
      pathInside(this.taskDirectory(record.id), 'task.json'),
      record,
    );
    await writeJsonAtomic(
      pathInside(this.taskDirectory(record.id), 'diagnostics.json'),
      {
        schemaVersion: 1,
        taskId: record.id,
        diagnostics: record.diagnostics,
      },
    );
  }

  async saveTaskInput(taskId: string, input: unknown): Promise<void> {
    await writeJsonAtomic(pathInside(this.taskDirectory(taskId), 'input.json'), {
      schemaVersion: 1,
      input,
    });
  }

  async taskInput<T>(taskId: string): Promise<T> {
    const file = await readJson<{ schemaVersion: 1; input: T }>(
      pathInside(this.taskDirectory(taskId), 'input.json'),
    );
    return file.input;
  }

  async findingsForTask(taskId: string): Promise<FindingRecord[]> {
    const file = await readJsonIfExists<{
      schemaVersion: 1;
      taskId: string;
      findings: FindingRecord[];
    }>(pathInside(this.taskDirectory(taskId), 'findings.json'));
    return file?.findings ?? [];
  }

  async saveFindings(taskId: string, findings: FindingRecord[]): Promise<void> {
    await writeJsonAtomic(pathInside(this.taskDirectory(taskId), 'findings.json'), {
      schemaVersion: 1,
      taskId,
      findings,
    });
  }

  async findings(): Promise<FindingRecord[]> {
    const tasks = await this.tasks();
    const collections = await Promise.all(
      tasks.map((task) => this.findingsForTask(task.id)),
    );
    return collections.flat();
  }

  async ignoreFinding(findingId: string, reason: string): Promise<void> {
    const tasks = await this.tasks();
    for (const task of tasks) {
      const findings = await this.findingsForTask(task.id);
      const index = findings.findIndex((finding) => finding.id === findingId);
      if (index === -1) continue;
      findings[index] = {
        ...findings[index],
        status: 'ignored',
        ignoredReason: reason || undefined,
        ignoredAt: new Date().toISOString(),
      };
      await this.saveFindings(task.id, findings);
      return;
    }
    throw new DesignXError({
      code: 'FINDING_NOT_FOUND',
      stage: 'finding-ignore',
      message: '找不到指定发现。',
      retryable: false,
    });
  }

  async markInterruptedTasks(): Promise<void> {
    const tasks = await this.tasks();
    const interrupted = tasks.filter(
      (task) => task.status === 'queued' || task.status === 'running',
    );
    await Promise.all(
      interrupted.map(async (task) => {
        const timestamp = new Date().toISOString();
        await this.saveTask({
          ...task,
          status: 'failed',
          stage: '应用退出导致中断',
          error: '上次运行在应用退出时中断，可重新运行该任务。',
          finishedAt: timestamp,
          diagnostics: [
            ...task.diagnostics,
            {
              timestamp,
              stage: '应用退出导致中断',
              code: 'APP_EXIT_INTERRUPTED',
              message: '任务未在应用退出前完成。',
              retryable: true,
            },
          ],
        });
      }),
    );
  }

  async snapshot(options: SnapshotOptions): Promise<WorkspaceSnapshot> {
    const [repositories, knowledgePackages, tasks, findings, settings] =
      await Promise.all([
        this.repositories(),
        this.knowledgePackages(),
        this.tasks(),
        this.findings(),
        this.settings(options.credentialConfigured),
      ]);
    return {
      schemaVersion: 1,
      workspacePath: this.root,
      gitAvailable: options.gitAvailable,
      gitVersion: options.gitVersion,
      repositories,
      knowledgePackages,
      tasks,
      findings,
      settings,
    };
  }

  relativeToWorkspace(path: string): string {
    return relative(this.root, path).replaceAll('\\', '/');
  }
}
