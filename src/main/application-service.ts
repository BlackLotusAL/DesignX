import { EventEmitter } from 'node:events';
import { extname } from 'node:path';
import { stat } from 'node:fs/promises';
import type { BrowserWindow, Dialog } from 'electron';
import {
  IPC_CHANNELS,
} from '../shared/contracts';
import type {
  AddRepositoryInput,
  IgnoreFindingInput,
  KnowledgeImportInput,
  PublishKnowledgeInput,
  SaveKnowledgeDraftInput,
  SaveSettingsInput,
  SelectedKnowledgeFile,
  StartAnalysisInput,
  TestModelInput,
} from '../shared/types';
import { DesignXError } from './errors';
import type { AnalysisService } from './services/analysis/analysis-service';
import type { GitService } from './services/git/git-service';
import {
  supportedKnowledgeFile,
  type KnowledgeService,
} from './services/knowledge/knowledge-service';
import type { ModelService } from './services/model/model-service';
import type { WorkspaceService } from './services/workspace/workspace-service';

export class ApplicationService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly git: GitService,
    private readonly knowledge: KnowledgeService,
    private readonly analysis: AnalysisService,
    private readonly model: ModelService,
    private readonly dialog: Pick<Dialog, 'showOpenDialog'>,
    private readonly getWindow: () => BrowserWindow | null,
    readonly events: EventEmitter,
  ) {}

  workspaceBootstrap() {
    return this.workspace.bootstrap();
  }

  workspaceSnapshot() {
    return this.workspace.snapshot();
  }

  async workspaceSelect() {
    if (this.analysis.hasActiveTasks()) {
      throw new DesignXError({
        code: 'WORKSPACE_SWITCH_TASK_ACTIVE',
        stage: 'workspace-switch',
        message: '有分析任务正在运行，请等待任务结束后再切换工作区。',
        retryable: true,
      });
    }
    const window = this.getWindow();
    const options = {
      title: '选择 DesignX 本地工作区',
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
    };
    const result = window
      ? await this.dialog.showOpenDialog(window, options)
      : await this.dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const snapshot = await this.workspace.switch(result.filePaths[0]);
    return { path: result.filePaths[0], snapshot };
  }

  async workspaceSwitch(path: string) {
    if (this.analysis.hasActiveTasks()) {
      throw new DesignXError({
        code: 'WORKSPACE_SWITCH_TASK_ACTIVE',
        stage: 'workspace-switch',
        message: '有分析任务正在运行，请等待任务结束后再切换工作区。',
        retryable: true,
      });
    }
    return this.workspace.switch(path);
  }

  async addRepository(input: AddRepositoryInput) {
    const store = this.workspace.currentStore();
    const repository = await this.git.addRepository(store, input);
    this.events.emit(IPC_CHANNELS.eventRepositoryUpdated, { repository });
    return repository;
  }

  async syncRepository(repositoryId: string) {
    const store = this.workspace.currentStore();
    const current = await store.repository(repositoryId);
    this.events.emit(IPC_CHANNELS.eventRepositoryUpdated, {
      repository: { ...current, status: 'syncing', error: undefined },
    });
    try {
      const repository = await this.git.sync(store, repositoryId);
      this.events.emit(IPC_CHANNELS.eventRepositoryUpdated, { repository });
      return repository;
    } catch (error) {
      const repository = await store.repository(repositoryId);
      this.events.emit(IPC_CHANNELS.eventRepositoryUpdated, { repository });
      throw error;
    }
  }

  async refreshRepository(repositoryId: string) {
    const repository = await this.git.refresh(
      this.workspace.currentStore(),
      repositoryId,
    );
    this.events.emit(IPC_CHANNELS.eventRepositoryUpdated, { repository });
    return repository;
  }

  async chooseKnowledgeFiles(): Promise<SelectedKnowledgeFile[]> {
    const window = this.getWindow();
    const options = {
      title: '选择规范文档',
      buttonLabel: '选择文档',
      properties: ['openFile', 'multiSelections'] as Array<
        'openFile' | 'multiSelections'
      >,
      filters: [
        { name: '支持的文档', extensions: ['md', 'pdf', 'docx'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    };
    const result = window
      ? await this.dialog.showOpenDialog(window, options)
      : await this.dialog.showOpenDialog(options);
    if (result.canceled) return [];
    if (result.filePaths.length > 20) {
      throw new DesignXError({
        code: 'KNOWLEDGE_FILE_COUNT_LIMIT',
        stage: 'knowledge-file-selection',
        message: '一次最多选择 20 个文档。',
        retryable: true,
      });
    }
    const files = await Promise.all(
      result.filePaths.map(async (filePath): Promise<SelectedKnowledgeFile> => {
        if (!supportedKnowledgeFile(filePath)) {
          throw new DesignXError({
            code: 'UNSUPPORTED_DOCUMENT',
            stage: 'knowledge-file-selection',
            message: '仅支持 Markdown、PDF 和 DOCX 文档。',
            retryable: true,
          });
        }
        const metadata = await stat(filePath);
        const extension = extname(filePath).toLowerCase() as SelectedKnowledgeFile['extension'];
        return {
          path: filePath,
          name: filePath.split(/[\\/]/).pop() ?? filePath,
          extension,
          size: metadata.size,
        };
      }),
    );
    if (files.some((file) => file.size > 25 * 1024 * 1024)) {
      throw new DesignXError({
        code: 'KNOWLEDGE_FILE_LIMIT',
        stage: 'knowledge-file-selection',
        message: '单个文档不能超过 25MB。',
        retryable: true,
      });
    }
    if (files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
      throw new DesignXError({
        code: 'KNOWLEDGE_BATCH_LIMIT',
        stage: 'knowledge-file-selection',
        message: '一次选择的文档总大小不能超过 100MB。',
        retryable: true,
      });
    }
    this.knowledge.authorizeFiles(files);
    return files;
  }

  importKnowledge(input: KnowledgeImportInput) {
    return this.knowledge.importDraft(this.workspace.currentStore(), input);
  }

  saveKnowledgeDraft(input: SaveKnowledgeDraftInput) {
    return this.knowledge.saveDraft(this.workspace.currentStore(), input);
  }

  publishKnowledge(input: PublishKnowledgeInput) {
    return this.knowledge.publish(this.workspace.currentStore(), input);
  }

  createKnowledgeVersion(packageId: string) {
    return this.knowledge.createVersion(this.workspace.currentStore(), packageId);
  }

  startAnalysis(input: StartAnalysisInput) {
    return this.analysis.start(this.workspace.currentStore(), input);
  }

  retryAnalysis(taskId: string) {
    return this.analysis.retry(this.workspace.currentStore(), taskId);
  }

  ignoreFinding(input: IgnoreFindingInput) {
    return this.workspace
      .currentStore()
      .ignoreFinding(input.findingId, input.reason);
  }

  getSettings() {
    return this.workspace.settings();
  }

  saveSettings(input: SaveSettingsInput) {
    return this.workspace.saveSettings(input);
  }

  async testModel(input: TestModelInput) {
    return this.model.testConnection(await this.workspace.modelConnection(input));
  }
}
