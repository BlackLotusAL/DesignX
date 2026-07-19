import { contextBridge, ipcRenderer } from 'electron';
import type { DesignXDesktopApi } from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';
import type {
  RepositoryUpdatedEvent,
  Result,
  TaskProgressEvent,
} from '../shared/types';

function invoke<T>(channel: string, input?: unknown): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, input) as Promise<Result<T>>;
}

const api: DesignXDesktopApi = {
  workspace: {
    bootstrap: () => invoke(IPC_CHANNELS.workspaceBootstrap),
    select: () => invoke(IPC_CHANNELS.workspaceSelect),
    switch: (input) => invoke(IPC_CHANNELS.workspaceSwitch, input),
    getSnapshot: () => invoke(IPC_CHANNELS.workspaceSnapshot),
  },
  repositories: {
    add: (input) => invoke(IPC_CHANNELS.repositoryAdd, input),
    sync: (input) => invoke(IPC_CHANNELS.repositorySync, input),
    refresh: (input) => invoke(IPC_CHANNELS.repositoryRefresh, input),
  },
  knowledge: {
    chooseFiles: () => invoke(IPC_CHANNELS.knowledgeChooseFiles),
    import: (input) => invoke(IPC_CHANNELS.knowledgeImport, input),
    saveDraft: (input) => invoke(IPC_CHANNELS.knowledgeSaveDraft, input),
    publish: (input) => invoke(IPC_CHANNELS.knowledgePublish, input),
    createVersion: (input) =>
      invoke(IPC_CHANNELS.knowledgeCreateVersion, input),
  },
  analysis: {
    start: (input) => invoke(IPC_CHANNELS.analysisStart, input),
    retry: (input) => invoke(IPC_CHANNELS.analysisRetry, input),
  },
  findings: {
    ignore: (input) => invoke(IPC_CHANNELS.findingIgnore, input),
  },
  settings: {
    get: () => invoke(IPC_CHANNELS.settingsGet),
    save: (input) => invoke(IPC_CHANNELS.settingsSave, input),
    testModel: (input) => invoke(IPC_CHANNELS.settingsTestModel, input),
  },
  events: {
    onTaskUpdated: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TaskProgressEvent) =>
        listener(payload);
      ipcRenderer.on(IPC_CHANNELS.eventTaskUpdated, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.eventTaskUpdated, handler);
    },
    onRepositoryUpdated: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: RepositoryUpdatedEvent,
      ) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.eventRepositoryUpdated, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.eventRepositoryUpdated, handler);
    },
  },
};

contextBridge.exposeInMainWorld('designx', api);
