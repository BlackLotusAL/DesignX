export type {
  AnalysisRange,
  AnalysisTaskRecord as AnalysisTask,
  FindingRecord as Finding,
  FindingSeverity,
  FindingStatus,
  KnowledgePackageRecord as KnowledgePackage,
  KnowledgeStatus,
  KnowledgeType,
  NavigationId,
  RepositoryRecord as Repository,
  RepositoryStatus,
  SettingsView as AppSettings,
  StartAnalysisInput as NewAnalysisInput,
  TaskStatus,
  WorkspaceSnapshot as AppSnapshot,
} from '../shared/types';

export type NewRepositoryInput = import('../shared/types').AddRepositoryInput;
export type NewKnowledgeInput = import('../shared/types').KnowledgeImportInput;
