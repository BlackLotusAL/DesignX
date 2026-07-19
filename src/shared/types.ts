export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export interface AppError {
  code: string;
  stage: string;
  message: string;
  retryable: boolean;
  detail?: string;
}

export type NavigationId =
  | 'analysis'
  | 'repositories'
  | 'knowledge'
  | 'tasks'
  | 'findings';

export type RepositoryStatus =
  | 'clean'
  | 'dirty'
  | 'ahead'
  | 'diverged'
  | 'syncing'
  | 'error';

export interface RepositoryRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  remoteUrl: string;
  branch: string;
  commit: string;
  lastSync: string;
  status: RepositoryStatus;
  localPath: string;
  lastAnalysisCommit?: string;
  error?: string;
}

export type KnowledgeType = '业务需求' | '系统设计' | '编程规范';
export type KnowledgeStatus = 'published' | 'draft';

export interface SourceLocation {
  kind: 'lines' | 'pages' | 'paragraphs';
  start: number;
  end: number;
  label: string;
}

export interface KnowledgeReferenceRecord {
  id: string;
  title: string;
  referencePath: string;
  sourcePath: string;
  sourceLocation: SourceLocation;
  excerpt: string;
  keywords: string[];
}

export interface KnowledgeVersionRecord {
  schemaVersion: 1;
  packageId: string;
  version: string;
  name: string;
  type: KnowledgeType;
  scope: string;
  publishedAt: string;
  skillPath: string;
  references: KnowledgeReferenceRecord[];
  sourceFiles: string[];
}

export interface KnowledgePackageRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  type: KnowledgeType;
  version: string;
  status: KnowledgeStatus;
  scope: string;
  updatedAt: string;
  sourceFiles: string[];
  publishedVersions: string[];
  hasDraft: boolean;
}

export type AnalysisRange = 'baseline' | 'current' | 'recent10';
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed';

export interface TaskDiagnostic {
  timestamp: string;
  stage: string;
  code: string;
  message: string;
  retryable: boolean;
  batch?: number;
}

export interface AnalysisTaskRecord {
  schemaVersion: 1;
  id: string;
  repositoryId: string;
  repositoryName: string;
  branch: string;
  range: AnalysisRange;
  rangeLabel: string;
  knowledge: string[];
  knowledgeVersionIds: string[];
  status: TaskStatus;
  stage: string;
  progress: number;
  findingCount: number | null;
  duration: string;
  startedAt: string;
  finishedAt?: string;
  focus: string;
  fromCommit?: string;
  toCommit?: string;
  error?: string;
  diagnostics: TaskDiagnostic[];
}

export type FindingSeverity = 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'ignored';
export type FindingCategory =
  | '代码质量'
  | '编程规范'
  | '业务需求一致性'
  | '系统设计一致性';

export interface CodeLine {
  number: number;
  content: string;
  highlight?: boolean;
}

export interface FindingRecord {
  schemaVersion: 1;
  id: string;
  taskId: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  type: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  status: FindingStatus;
  file: string;
  line: number;
  lineRange: string;
  symbol: string;
  commit: string;
  knownFact: string;
  inference: string;
  codeLines: CodeLine[];
  knowledge: {
    packageId: string;
    packageName: string;
    version: string;
    section: string;
    excerpt: string;
    referencePath: string;
    sourcePath: string;
    sourceLocation: string;
  };
  suggestions: string[];
  ignoredReason?: string;
  ignoredAt?: string;
}

export interface SettingsView {
  workspace: string;
  apiUrl: string;
  model: string;
  timeout: number;
  credentialConfigured: boolean;
}

export interface WorkspaceSnapshot {
  schemaVersion: 1;
  workspacePath: string | null;
  gitAvailable: boolean;
  gitVersion?: string;
  repositories: RepositoryRecord[];
  knowledgePackages: KnowledgePackageRecord[];
  tasks: AnalysisTaskRecord[];
  findings: FindingRecord[];
  settings: SettingsView;
  workspaceError?: AppError;
}

export interface WorkspaceSelection {
  path: string;
  snapshot: WorkspaceSnapshot;
}

export interface AddRepositoryInput {
  name: string;
  remoteUrl: string;
  branch: string;
}

export interface SelectedKnowledgeFile {
  path: string;
  name: string;
  extension: '.md' | '.pdf' | '.docx';
  size: number;
}

export interface KnowledgeImportInput {
  name: string;
  type: KnowledgeType;
  scope: string;
  files: SelectedKnowledgeFile[];
}

export interface KnowledgeDraftView {
  packageId: string;
  name: string;
  type: KnowledgeType;
  scope: string;
  skillMarkdown: string;
  references: KnowledgeReferenceRecord[];
  sourceFiles: string[];
  versionPreview: string;
}

export interface SaveKnowledgeDraftInput {
  packageId: string;
  name: string;
  type: KnowledgeType;
  scope: string;
  skillMarkdown: string;
}

export type PublishKnowledgeInput = SaveKnowledgeDraftInput;

export interface StartAnalysisInput {
  repositoryId: string;
  knowledgeVersionIds: string[];
  range: AnalysisRange;
  focus: string;
}

export interface IgnoreFindingInput {
  findingId: string;
  reason: string;
}

export interface SaveSettingsInput {
  apiUrl: string;
  model: string;
  timeout: number;
  credential?: string;
  clearCredential?: boolean;
}

export type TestModelInput = SaveSettingsInput;

export interface TaskProgressEvent {
  task: AnalysisTaskRecord;
}

export interface RepositoryUpdatedEvent {
  repository: RepositoryRecord;
}

export interface ModelKnowledgeEvidence {
  packageId: string;
  version: string;
  section: string;
  referencePath: string;
  sourcePath: string;
  sourceLocation: string;
  excerpt: string;
}

export interface ModelFinding {
  title: string;
  type: FindingCategory;
  severity: FindingSeverity;
  confidence: number;
  file: string;
  line: number;
  symbol: string;
  knownFact: string;
  inference: string;
  knowledge: ModelKnowledgeEvidence;
  suggestions: string[];
}

export interface ModelFindingEnvelope {
  findings: ModelFinding[];
}
