export type NavigationId =
  | 'analysis'
  | 'repositories'
  | 'knowledge'
  | 'tasks'
  | 'findings';

export type RepositoryStatus = 'clean' | 'ahead' | 'syncing' | 'error';

export interface Repository {
  id: string;
  name: string;
  remoteUrl: string;
  branch: string;
  commit: string;
  lastSync: string;
  status: RepositoryStatus;
  localPath: string;
  error?: string;
}

export type KnowledgeType = '业务需求' | '系统设计' | '编程规范';
export type KnowledgeStatus = 'published' | 'draft';

export interface KnowledgePackage {
  id: string;
  name: string;
  type: KnowledgeType;
  version: string;
  status: KnowledgeStatus;
  scope: string;
  updatedAt: string;
  sourceFiles: string[];
}

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed';

export interface AnalysisTask {
  id: string;
  repositoryId: string;
  repositoryName: string;
  branch: string;
  range: string;
  knowledge: string[];
  status: TaskStatus;
  stage: string;
  progress: number;
  findingCount: number | null;
  duration: string;
  startedAt: string;
  focus: string;
  autoAdvance?: boolean;
  error?: string;
}

export type FindingSeverity = 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'ignored';

export interface CodeLine {
  number: number;
  content: string;
  highlight?: boolean;
}

export interface Finding {
  id: string;
  taskId: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  type: '代码质量' | '编程规范' | '业务需求一致性' | '系统设计一致性';
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
    packageName: string;
    version: string;
    section: string;
    excerpt: string;
    sourcePath: string;
  };
  suggestions: string[];
  ignoredReason?: string;
}

export interface AppSettings {
  workspace: string;
  apiUrl: string;
  model: string;
  credential: string;
  timeout: number;
}

export interface AppSnapshot {
  version: 1;
  repositories: Repository[];
  knowledgePackages: KnowledgePackage[];
  tasks: AnalysisTask[];
  findings: Finding[];
  settings: AppSettings;
}

export interface NewRepositoryInput {
  name: string;
  remoteUrl: string;
  branch: string;
}

export interface NewKnowledgeInput {
  name: string;
  type: KnowledgeType;
  scope: string;
  sourceFiles: string[];
  publish: boolean;
}

export interface NewAnalysisInput {
  repositoryId: string;
  branch: string;
  knowledgeIds: string[];
  range: string;
  focus: string;
}
