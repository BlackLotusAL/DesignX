import type {
  AddRepositoryInput,
  AnalysisTaskRecord,
  IgnoreFindingInput,
  KnowledgeDraftView,
  KnowledgeImportInput,
  KnowledgePackageRecord,
  PublishKnowledgeInput,
  RepositoryRecord,
  RepositoryUpdatedEvent,
  Result,
  SaveKnowledgeDraftInput,
  SaveSettingsInput,
  SelectedKnowledgeFile,
  SettingsView,
  StartAnalysisInput,
  TaskProgressEvent,
  TestModelInput,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from './types';

export const IPC_CHANNELS = {
  workspaceBootstrap: 'designx:workspace:bootstrap',
  workspaceSelect: 'designx:workspace:select',
  workspaceSwitch: 'designx:workspace:switch',
  workspaceSnapshot: 'designx:workspace:snapshot',
  repositoryAdd: 'designx:repositories:add',
  repositorySync: 'designx:repositories:sync',
  repositoryRefresh: 'designx:repositories:refresh',
  knowledgeChooseFiles: 'designx:knowledge:choose-files',
  knowledgeImport: 'designx:knowledge:import',
  knowledgeSaveDraft: 'designx:knowledge:save-draft',
  knowledgePublish: 'designx:knowledge:publish',
  knowledgeCreateVersion: 'designx:knowledge:create-version',
  analysisStart: 'designx:analysis:start',
  analysisRetry: 'designx:analysis:retry',
  findingIgnore: 'designx:findings:ignore',
  settingsGet: 'designx:settings:get',
  settingsSave: 'designx:settings:save',
  settingsTestModel: 'designx:settings:test-model',
  eventTaskUpdated: 'designx:event:task-updated',
  eventRepositoryUpdated: 'designx:event:repository-updated',
} as const;

export interface DesignXDesktopApi {
  workspace: {
    bootstrap(): Promise<Result<WorkspaceSnapshot>>;
    select(): Promise<Result<WorkspaceSelection | null>>;
    switch(input: { path: string }): Promise<Result<WorkspaceSnapshot>>;
    getSnapshot(): Promise<Result<WorkspaceSnapshot>>;
  };
  repositories: {
    add(input: AddRepositoryInput): Promise<Result<RepositoryRecord>>;
    sync(input: { repositoryId: string }): Promise<Result<RepositoryRecord>>;
    refresh(input: { repositoryId: string }): Promise<Result<RepositoryRecord>>;
  };
  knowledge: {
    chooseFiles(): Promise<Result<SelectedKnowledgeFile[]>>;
    import(input: KnowledgeImportInput): Promise<Result<KnowledgeDraftView>>;
    saveDraft(input: SaveKnowledgeDraftInput): Promise<Result<KnowledgePackageRecord>>;
    publish(input: PublishKnowledgeInput): Promise<Result<KnowledgePackageRecord>>;
    createVersion(input: { packageId: string }): Promise<Result<KnowledgeDraftView>>;
  };
  analysis: {
    start(input: StartAnalysisInput): Promise<Result<AnalysisTaskRecord>>;
    retry(input: { taskId: string }): Promise<Result<AnalysisTaskRecord>>;
  };
  findings: {
    ignore(input: IgnoreFindingInput): Promise<Result<void>>;
  };
  settings: {
    get(): Promise<Result<SettingsView>>;
    save(input: SaveSettingsInput): Promise<Result<SettingsView>>;
    testModel(input: TestModelInput): Promise<Result<{ latencyMs: number; model: string }>>;
  };
  events: {
    onTaskUpdated(listener: (event: TaskProgressEvent) => void): () => void;
    onRepositoryUpdated(listener: (event: RepositoryUpdatedEvent) => void): () => void;
  };
}
