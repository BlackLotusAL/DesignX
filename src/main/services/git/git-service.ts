import { execFile } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import picomatch from 'picomatch';
import type {
  AddRepositoryInput,
  AnalysisRange,
  RepositoryRecord,
} from '../../../shared/types';
import { DesignXError } from '../../errors';
import { writeJsonAtomic } from '../../persistence/atomic';
import type { WorkspaceStore } from '../../persistence/workspace-store';

const SOURCE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.kt',
  '.kts',
  '.md',
  '.php',
  '.proto',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

export interface GitProbe {
  available: boolean;
  version?: string;
}

export interface AnalysisFileContext {
  path: string;
  diff: string;
  content: string;
  lineCount: number;
  language: string;
}

export interface GitAnalysisInput {
  repository: RepositoryRecord;
  fromCommit?: string;
  toCommit: string;
  displayRange: string;
  files: AnalysisFileContext[];
  totalDiffBytes: number;
}

interface RunGitOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

function runExecutable(
  file: string,
  args: string[],
  options: RunGitOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: options.cwd,
        windowsHide: true,
        timeout: options.timeoutMs ?? 60_000,
        maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: '0',
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const wrapped = new Error(stderr.trim() || error.message);
          Object.assign(wrapped, {
            code: 'code' in error ? error.code : undefined,
            signal: 'signal' in error ? error.signal : undefined,
          });
          reject(wrapped);
          return;
        }
        resolve(stdout.trimEnd());
      },
    );
  });
}

function languageForPath(filePath: string): string {
  const extension = extname(filePath).slice(1).toLowerCase();
  return extension || 'text';
}

function safeRemote(remoteUrl: string, allowLocalRepositories: boolean): boolean {
  if (/^(https:\/\/|ssh:\/\/|git@)/i.test(remoteUrl)) return true;
  if (allowLocalRepositories && (/^file:\/\//i.test(remoteUrl) || /^[A-Za-z]:[\\/]/.test(remoteUrl))) {
    return true;
  }
  return false;
}

export class GitService {
  constructor(
    private readonly allowLocalRepositories = false,
    private readonly executable = 'git',
  ) {}

  async probe(): Promise<GitProbe> {
    try {
      const version = await runExecutable(this.executable, ['--version'], {
        timeoutMs: 10_000,
      });
      return { available: true, version };
    } catch {
      return { available: false };
    }
  }

  private async git(args: string[], cwd?: string, timeoutMs?: number): Promise<string> {
    try {
      return await runExecutable(this.executable, args, { cwd, timeoutMs });
    } catch (error) {
      throw new DesignXError(
        {
          code: 'GIT_COMMAND_FAILED',
          stage: 'git',
          message: error instanceof Error ? error.message : 'Git 命令执行失败。',
          retryable: true,
        },
        { cause: error },
      );
    }
  }

  async addRepository(
    store: WorkspaceStore,
    input: AddRepositoryInput,
  ): Promise<RepositoryRecord> {
    const probe = await this.probe();
    if (!probe.available) {
      throw new DesignXError({
        code: 'GIT_NOT_FOUND',
        stage: 'repository-add',
        message: '未检测到 Windows 系统 Git，请先安装 Git 并重新启动 DesignX。',
        retryable: true,
      });
    }
    if (!safeRemote(input.remoteUrl, this.allowLocalRepositories)) {
      throw new DesignXError({
        code: 'INVALID_GIT_REMOTE',
        stage: 'repository-add',
        message: 'Git 地址仅支持 HTTPS、SSH 或 git@ 格式。',
        retryable: true,
      });
    }
    const existing = await store.repositories();
    if (
      existing.some(
        (repository) =>
          repository.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
    ) {
      throw new DesignXError({
        code: 'REPOSITORY_NAME_CONFLICT',
        stage: 'repository-add',
        message: '工作区中已存在同名代码仓。',
        retryable: true,
      });
    }

    const branchRef = `refs/heads/${input.branch}`;
    const remoteResult = await this.git(
      ['ls-remote', '--heads', input.remoteUrl, branchRef],
      undefined,
      90_000,
    );
    if (!remoteResult.trim()) {
      throw new DesignXError({
        code: 'GIT_BRANCH_NOT_FOUND',
        stage: 'repository-add',
        message: `远程仓库中不存在默认分支 ${input.branch}。`,
        retryable: true,
      });
    }

    const repositoryId = randomUUID();
    const temporaryId = `${repositoryId}.tmp-${randomUUID()}`;
    const temporaryDirectory = store.repositoryDirectory(temporaryId);
    const temporaryCheckout = join(temporaryDirectory, 'checkout');
    const finalDirectory = store.repositoryDirectory(repositoryId);
    try {
      await mkdir(temporaryDirectory, { recursive: false });
      await this.git(
        [
          'clone',
          '--single-branch',
          '--branch',
          input.branch,
          '--',
          input.remoteUrl,
          temporaryCheckout,
        ],
        store.root,
        5 * 60_000,
      );
      const commit = await this.git(['rev-parse', '--short=12', 'HEAD'], temporaryCheckout);
      const now = new Date().toISOString();
      const record: RepositoryRecord = {
        schemaVersion: 1,
        id: repositoryId,
        name: input.name,
        remoteUrl: input.remoteUrl,
        branch: input.branch,
        commit,
        lastSync: now,
        status: 'clean',
        localPath: store.relativeToWorkspace(join(finalDirectory, 'checkout')),
      };
      await writeJsonAtomic(join(temporaryDirectory, 'repository.json'), record);
      await rename(temporaryDirectory, finalDirectory);
      return record;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      if (error instanceof DesignXError) throw error;
      throw new DesignXError(
        {
          code: 'GIT_CLONE_FAILED',
          stage: 'repository-add',
          message: '代码仓克隆失败，未创建半完成记录。',
          retryable: true,
          detail: error instanceof Error ? error.message : undefined,
        },
        { cause: error },
      );
    }
  }

  async refresh(
    store: WorkspaceStore,
    repositoryId: string,
  ): Promise<RepositoryRecord> {
    const repository = await store.repository(repositoryId);
    const checkout = store.repositoryCheckout(repositoryId);
    const [commit, porcelain] = await Promise.all([
      this.git(['rev-parse', '--short=12', 'HEAD'], checkout),
      this.git(['status', '--porcelain=v1'], checkout),
    ]);
    const refreshed: RepositoryRecord = {
      ...repository,
      commit,
      status: porcelain.trim() ? 'dirty' : 'clean',
      error: porcelain.trim()
        ? '代码仓存在未提交修改，分析可继续读取，但同步已受保护。'
        : undefined,
    };
    await store.saveRepository(refreshed);
    return refreshed;
  }

  async sync(
    store: WorkspaceStore,
    repositoryId: string,
  ): Promise<RepositoryRecord> {
    const repository = await store.repository(repositoryId);
    const checkout = store.repositoryCheckout(repositoryId);
    const syncing: RepositoryRecord = {
      ...repository,
      status: 'syncing',
      error: undefined,
    };
    await store.saveRepository(syncing);
    try {
      const porcelain = await this.git(['status', '--porcelain=v1'], checkout);
      if (porcelain.trim()) {
        throw new DesignXError({
          code: 'GIT_WORKTREE_DIRTY',
          stage: 'repository-sync',
          message: '代码仓存在未提交修改。请先提交或暂存修改后再同步。',
          retryable: true,
        });
      }
      await this.git(['fetch', '--prune', 'origin', repository.branch], checkout, 120_000);
      const counts = await this.git(
        [
          'rev-list',
          '--left-right',
          '--count',
          `HEAD...origin/${repository.branch}`,
        ],
        checkout,
      );
      const [ahead = 0, behind = 0] = counts
        .trim()
        .split(/\s+/)
        .map((value) => Number(value));
      if (ahead > 0 && behind > 0) {
        throw new DesignXError({
          code: 'GIT_BRANCH_DIVERGED',
          stage: 'repository-sync',
          message: '本地分支与远程分支已经分叉。请在 Git 工具中处理后再同步。',
          retryable: true,
        });
      }
      if (ahead > 0) {
        throw new DesignXError({
          code: 'GIT_BRANCH_AHEAD',
          stage: 'repository-sync',
          message: '本地分支包含未推送提交。DesignX 不会覆盖该版本。',
          retryable: true,
        });
      }
      if (behind > 0) {
        await this.git(
          ['merge', '--ff-only', `origin/${repository.branch}`],
          checkout,
        );
      }
      const commit = await this.git(['rev-parse', '--short=12', 'HEAD'], checkout);
      const updated: RepositoryRecord = {
        ...repository,
        commit,
        status: 'clean',
        lastSync: new Date().toISOString(),
        error: undefined,
      };
      await store.saveRepository(updated);
      return updated;
    } catch (error) {
      const appError =
        error instanceof DesignXError
          ? error
          : new DesignXError({
              code: 'GIT_SYNC_FAILED',
              stage: 'repository-sync',
              message: '同步失败，已保留原有可用版本。',
              retryable: true,
              detail: error instanceof Error ? error.message : undefined,
            });
      const status =
        appError.code === 'GIT_WORKTREE_DIRTY'
          ? 'dirty'
          : appError.code === 'GIT_BRANCH_DIVERGED'
            ? 'diverged'
            : appError.code === 'GIT_BRANCH_AHEAD'
              ? 'ahead'
              : 'error';
      await store.saveRepository({
        ...repository,
        status,
        error: appError.message,
      });
      throw appError;
    }
  }

  async collectAnalysisInput(
    store: WorkspaceStore,
    repositoryId: string,
    range: AnalysisRange,
    scopes: string[],
    focus: string,
  ): Promise<GitAnalysisInput> {
    const repository = await store.repository(repositoryId);
    const checkout = store.repositoryCheckout(repositoryId);
    const toCommit = await this.git(['rev-parse', 'HEAD'], checkout);
    let fromCommit: string | undefined;

    if (range === 'baseline' && repository.lastAnalysisCommit) {
      try {
        await this.git(['cat-file', '-e', `${repository.lastAnalysisCommit}^{commit}`], checkout);
        fromCommit = repository.lastAnalysisCommit;
      } catch {
        fromCommit = undefined;
      }
    } else if (range === 'recent10') {
      const commits = (
        await this.git(['rev-list', '--max-count=11', 'HEAD'], checkout)
      )
        .split(/\r?\n/)
        .filter(Boolean);
      if (commits.length > 1) fromCommit = commits.at(-1);
    }

    let paths: string[];
    if (fromCommit) {
      paths = (
        await this.git(
          ['diff', '--name-only', '--diff-filter=ACMR', `${fromCommit}..${toCommit}`],
          checkout,
        )
      )
        .split(/\r?\n/)
        .filter(Boolean);
    } else {
      paths = (await this.git(['ls-files'], checkout))
        .split(/\r?\n/)
        .filter(Boolean);
      const matchers = scopes
        .filter(Boolean)
        .map((scope) => picomatch(scope.replaceAll('\\', '/'), { dot: true }));
      if (matchers.length > 0) {
        paths = paths.filter((filePath) =>
          matchers.some((matcher) => matcher(filePath.replaceAll('\\', '/'))),
        );
      }
      const focusPaths = focus
        .split(/[\s,，;；]+/)
        .map((token) => token.trim().replaceAll('\\', '/'))
        .filter((token) => token.includes('/') || token.includes('.'));
      if (focusPaths.length > 0) {
        const narrowed = paths.filter((filePath) =>
          focusPaths.some((token) => filePath.toLowerCase().includes(token.toLowerCase())),
        );
        if (narrowed.length > 0) paths = narrowed;
      }
    }

    paths = paths.filter((filePath) =>
      SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase()),
    );
    if (paths.length > 200) {
      throw new DesignXError({
        code: 'ANALYSIS_FILE_LIMIT',
        stage: '读取 Git Diff',
        message: `分析范围包含 ${paths.length} 个文件，超过 200 个文件上限。请缩小关注范围。`,
        retryable: true,
      });
    }

    const files: AnalysisFileContext[] = [];
    let totalDiffBytes = 0;
    for (const filePath of paths) {
      const content = await this.git(['show', `${toCommit}:${filePath}`], checkout);
      const diff = fromCommit
        ? await this.git(
            ['diff', '--unified=80', `${fromCommit}..${toCommit}`, '--', filePath],
            checkout,
          )
        : [
            `diff --git a/${filePath} b/${filePath}`,
            `--- /dev/null`,
            `+++ b/${filePath}`,
            ...content.split(/\r?\n/).map((line) => `+${line}`),
          ].join('\n');
      totalDiffBytes += Buffer.byteLength(diff, 'utf8');
      if (totalDiffBytes > 2 * 1024 * 1024) {
        throw new DesignXError({
          code: 'ANALYSIS_DIFF_LIMIT',
          stage: '读取 Git Diff',
          message: 'Git Diff 超过 2MB 上限。请缩小关注范围。',
          retryable: true,
        });
      }
      files.push({
        path: filePath.replaceAll('\\', '/'),
        diff,
        content,
        lineCount: content.split(/\r?\n/).length,
        language: languageForPath(filePath),
      });
    }

    const displayRange = fromCommit
      ? `${fromCommit.slice(0, 12)}..${toCommit.slice(0, 12)}`
      : `当前基线 @ ${toCommit.slice(0, 12)}`;
    return {
      repository,
      fromCommit,
      toCommit,
      displayRange,
      files,
      totalDiffBytes,
    };
  }

  async verifyCodeLocation(
    store: WorkspaceStore,
    repositoryId: string,
    commit: string,
    filePath: string,
    line: number,
  ): Promise<boolean> {
    const checkout = store.repositoryCheckout(repositoryId);
    try {
      const head = await this.git(['rev-parse', 'HEAD'], checkout);
      if (head !== commit) return false;
      const content = await this.git(['show', `${commit}:${filePath}`], checkout);
      return line >= 1 && line <= content.split(/\r?\n/).length;
    } catch {
      return false;
    }
  }

  async commitBaseline(
    store: WorkspaceStore,
    repositoryId: string,
    commit: string,
  ): Promise<void> {
    const repository = await store.repository(repositoryId);
    await store.saveRepository({ ...repository, lastAnalysisCommit: commit });
  }
}

export function repositoryDisplayName(remoteUrl: string): string {
  return basename(remoteUrl.replace(/\.git$/i, '')) || 'repository';
}
