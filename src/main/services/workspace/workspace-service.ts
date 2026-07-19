import { dirname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type {
  SaveSettingsInput,
  SettingsView,
  WorkspaceSnapshot,
} from '../../../shared/types';
import { DesignXError, toAppError } from '../../errors';
import { readJsonIfExists, writeJsonAtomic } from '../../persistence/atomic';
import { WorkspaceStore } from '../../persistence/workspace-store';
import type { CredentialStore } from '../../security/credential-store';
import type { GitProbe, GitService } from '../git/git-service';
import { LogService } from '../logging/log-service';
import type { ModelConnection } from '../model/model-service';

interface RecentWorkspaceFile {
  schemaVersion: 1;
  path: string;
}

interface EnvironmentDefaults {
  workspace?: string;
  apiUrl?: string;
  model?: string;
  credential?: string;
}

export class WorkspaceService {
  private store: WorkspaceStore | null = null;
  private readonly recentWorkspaceFile: string;
  private gitProbe: GitProbe | null = null;
  private bootstrapIssue: ReturnType<typeof toAppError> | null = null;

  constructor(
    userDataPath: string,
    private readonly credentialStore: CredentialStore,
    private readonly git: GitService,
    private readonly isPackaged: boolean,
    private readonly environment: EnvironmentDefaults = {},
  ) {
    this.recentWorkspaceFile = join(userDataPath, 'recent-workspace.json');
  }

  private developmentSettings() {
    if (this.isPackaged) return {};
    return {
      ...(this.environment.apiUrl ? { apiUrl: this.environment.apiUrl } : {}),
      ...(this.environment.model ? { model: this.environment.model } : {}),
    };
  }

  private async probeGit(): Promise<GitProbe> {
    if (!this.gitProbe) this.gitProbe = await this.git.probe();
    return this.gitProbe;
  }

  private async emptySnapshot(): Promise<WorkspaceSnapshot> {
    const git = await this.probeGit();
    const settings = this.developmentSettings();
    return {
      schemaVersion: 1,
      workspacePath: null,
      gitAvailable: git.available,
      gitVersion: git.version,
      repositories: [],
      knowledgePackages: [],
      tasks: [],
      findings: [],
      settings: {
        workspace: '尚未选择工作区',
        apiUrl: settings.apiUrl ?? 'https://model.internal.example',
        model: settings.model ?? 'enterprise-model',
        timeout: 120,
        credentialConfigured: await this.credentialStore.isConfigured(),
      },
      ...(this.bootstrapIssue ? { workspaceError: this.bootstrapIssue } : {}),
    };
  }

  async bootstrap(): Promise<WorkspaceSnapshot> {
    if (this.store) return this.snapshot();
    const recent = await readJsonIfExists<RecentWorkspaceFile>(
      this.recentWorkspaceFile,
    );
    const requestedPath =
      (!this.isPackaged ? this.environment.workspace : undefined) ??
      recent?.path;
    if (!requestedPath) return this.emptySnapshot();
    try {
      await this.switch(requestedPath, false);
      return this.snapshot();
    } catch (error) {
      this.bootstrapIssue = toAppError(error, 'workspace-bootstrap');
      this.store = null;
      return this.emptySnapshot();
    }
  }

  async switch(path: string, remember = true): Promise<WorkspaceSnapshot> {
    const candidate = new WorkspaceStore(resolve(path), this.developmentSettings());
    await candidate.initialize();
    await candidate.markInterruptedTasks();
    const log = new LogService(candidate.designxDirectory);
    await log.prune();
    if (remember) {
      await mkdir(dirname(this.recentWorkspaceFile), { recursive: true });
      await writeJsonAtomic(this.recentWorkspaceFile, {
        schemaVersion: 1,
        path: candidate.root,
      } satisfies RecentWorkspaceFile);
    }
    this.store = candidate;
    this.bootstrapIssue = null;
    return this.snapshot();
  }

  currentStore(): WorkspaceStore {
    if (!this.store) {
      throw new DesignXError({
        code: 'WORKSPACE_REQUIRED',
        stage: 'workspace',
        message: '请先选择本地工作区。',
        retryable: true,
      });
    }
    return this.store;
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    if (!this.store) return this.emptySnapshot();
    const [credentialConfigured, git] = await Promise.all([
      this.credentialStore.isConfigured(),
      this.probeGit(),
    ]);
    const snapshot = await this.store.snapshot({
      credentialConfigured,
      gitAvailable: git.available,
      gitVersion: git.version,
    });
    if (!this.isPackaged) {
      if (this.environment.apiUrl) snapshot.settings.apiUrl = this.environment.apiUrl;
      if (this.environment.model) snapshot.settings.model = this.environment.model;
    }
    return snapshot;
  }

  async settings(): Promise<SettingsView> {
    return (await this.snapshot()).settings;
  }

  async saveSettings(input: SaveSettingsInput): Promise<SettingsView> {
    const store = this.currentStore();
    await store.updateSettings({
      apiUrl: input.apiUrl,
      model: input.model,
      timeout: input.timeout,
    });
    if (input.clearCredential) {
      await this.credentialStore.clear();
    } else if (input.credential?.trim()) {
      await this.credentialStore.set(input.credential.trim());
    }
    return this.settings();
  }

  async modelConnection(
    draft?: SaveSettingsInput,
  ): Promise<ModelConnection> {
    const store = this.currentStore();
    const stored = store.getModelSettings();
    const baseUrl =
      (!this.isPackaged ? this.environment.apiUrl : undefined) ??
      draft?.apiUrl ??
      stored.apiUrl;
    const model =
      (!this.isPackaged ? this.environment.model : undefined) ??
      draft?.model ??
      stored.model;
    const credential =
      (!this.isPackaged ? this.environment.credential : undefined) ??
      draft?.credential?.trim() ??
      (await this.credentialStore.get()) ??
      '';
    return {
      baseUrl,
      model,
      credential,
      timeoutSeconds: draft?.timeout ?? stored.timeout,
      cachedMode: stored.structuredOutputModes[baseUrl],
    };
  }

  logService(store = this.currentStore()): LogService {
    return new LogService(store.designxDirectory);
  }
}
