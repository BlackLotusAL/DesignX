import type { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';
import { IPC_CHANNELS } from '../../shared/contracts';
import {
  addRepositoryInputSchema,
  ignoreFindingInputSchema,
  knowledgeImportInputSchema,
  packageIdSchema,
  publishKnowledgeInputSchema,
  repositoryIdSchema,
  saveKnowledgeDraftInputSchema,
  saveSettingsInputSchema,
  startAnalysisInputSchema,
  taskIdSchema,
  testModelInputSchema,
  workspacePathSchema,
} from '../../shared/schemas';
import { asResult, DesignXError } from '../errors';
import type { ApplicationService } from '../application-service';

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow,
): void {
  if (
    event.sender.id !== window.webContents.id ||
    event.senderFrame !== window.webContents.mainFrame
  ) {
    throw new DesignXError({
      code: 'UNTRUSTED_IPC_SENDER',
      stage: 'ipc',
      message: '拒绝来自非主渲染页面的请求。',
      retryable: false,
    });
  }
}

export function registerIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  application: ApplicationService,
  events: EventEmitter,
): () => void {
  const channels: string[] = [];
  const register = <Input, Output>(
    channel: string,
    stage: string,
    schema: ZodType<Input>,
    handler: (input: Input) => Promise<Output>,
  ) => {
    channels.push(channel);
    ipcMain.handle(channel, async (event, rawInput) =>
      asResult(stage, async () => {
        assertTrustedSender(event, window);
        return handler(schema.parse(rawInput));
      }),
    );
  };
  const noInput = z.unknown().optional();

  register(
    IPC_CHANNELS.workspaceBootstrap,
    'workspace-bootstrap',
    noInput,
    () => application.workspaceBootstrap(),
  );
  register(
    IPC_CHANNELS.workspaceSelect,
    'workspace-select',
    noInput,
    () => application.workspaceSelect(),
  );
  register(
    IPC_CHANNELS.workspaceSwitch,
    'workspace-switch',
    workspacePathSchema,
    ({ path }) => application.workspaceSwitch(path),
  );
  register(
    IPC_CHANNELS.workspaceSnapshot,
    'workspace-snapshot',
    noInput,
    () => application.workspaceSnapshot(),
  );
  register(
    IPC_CHANNELS.repositoryAdd,
    'repository-add',
    addRepositoryInputSchema,
    (input) => application.addRepository(input),
  );
  register(
    IPC_CHANNELS.repositorySync,
    'repository-sync',
    repositoryIdSchema,
    ({ repositoryId }) => application.syncRepository(repositoryId),
  );
  register(
    IPC_CHANNELS.repositoryRefresh,
    'repository-refresh',
    repositoryIdSchema,
    ({ repositoryId }) => application.refreshRepository(repositoryId),
  );
  register(
    IPC_CHANNELS.knowledgeChooseFiles,
    'knowledge-file-selection',
    noInput,
    () => application.chooseKnowledgeFiles(),
  );
  register(
    IPC_CHANNELS.knowledgeImport,
    'knowledge-import',
    knowledgeImportInputSchema,
    (input) => application.importKnowledge(input),
  );
  register(
    IPC_CHANNELS.knowledgeSaveDraft,
    'knowledge-save-draft',
    saveKnowledgeDraftInputSchema,
    (input) => application.saveKnowledgeDraft(input),
  );
  register(
    IPC_CHANNELS.knowledgePublish,
    'knowledge-publish',
    publishKnowledgeInputSchema,
    (input) => application.publishKnowledge(input),
  );
  register(
    IPC_CHANNELS.knowledgeCreateVersion,
    'knowledge-create-version',
    packageIdSchema,
    ({ packageId }) => application.createKnowledgeVersion(packageId),
  );
  register(
    IPC_CHANNELS.analysisStart,
    'analysis-start',
    startAnalysisInputSchema,
    (input) => application.startAnalysis(input),
  );
  register(
    IPC_CHANNELS.analysisRetry,
    'analysis-retry',
    taskIdSchema,
    ({ taskId }) => application.retryAnalysis(taskId),
  );
  register(
    IPC_CHANNELS.findingIgnore,
    'finding-ignore',
    ignoreFindingInputSchema,
    (input) => application.ignoreFinding(input),
  );
  register(
    IPC_CHANNELS.settingsGet,
    'settings-get',
    noInput,
    () => application.getSettings(),
  );
  register(
    IPC_CHANNELS.settingsSave,
    'settings-save',
    saveSettingsInputSchema,
    (input) => application.saveSettings(input),
  );
  register(
    IPC_CHANNELS.settingsTestModel,
    'settings-test-model',
    testModelInputSchema,
    (input) => application.testModel(input),
  );

  const taskListener = (payload: unknown) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.eventTaskUpdated, payload);
    }
  };
  const repositoryListener = (payload: unknown) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.eventRepositoryUpdated, payload);
    }
  };
  events.on(IPC_CHANNELS.eventTaskUpdated, taskListener);
  events.on(IPC_CHANNELS.eventRepositoryUpdated, repositoryListener);

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
    events.off(IPC_CHANNELS.eventTaskUpdated, taskListener);
    events.off(IPC_CHANNELS.eventRepositoryUpdated, repositoryListener);
  };
}
