import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AddRepositoryInput,
  AppError,
  IgnoreFindingInput,
  KnowledgeDraftView,
  KnowledgeImportInput,
  PublishKnowledgeInput,
  SaveKnowledgeDraftInput,
  SaveSettingsInput,
  SelectedKnowledgeFile,
  StartAnalysisInput,
  TestModelInput,
  WorkspaceSnapshot,
} from '../../shared/types';

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspacePath: null,
  gitAvailable: false,
  repositories: [],
  knowledgePackages: [],
  tasks: [],
  findings: [],
  settings: {
    workspace: '尚未选择工作区',
    apiUrl: 'https://model.internal.example',
    model: 'enterprise-model',
    timeout: 120,
    credentialConfigured: false,
  },
};

interface AppDataContextValue {
  snapshot: WorkspaceSnapshot;
  loading: boolean;
  lastError: AppError | null;
}

interface AppActionsContextValue {
  clearError(): void;
  refreshSnapshot(): Promise<boolean>;
  selectWorkspace(): Promise<boolean>;
  switchWorkspace(path: string): Promise<boolean>;
  addRepository(input: AddRepositoryInput): Promise<boolean>;
  syncRepository(repositoryId: string): Promise<boolean>;
  refreshRepository(repositoryId: string): Promise<boolean>;
  chooseKnowledgeFiles(): Promise<SelectedKnowledgeFile[]>;
  importKnowledge(input: KnowledgeImportInput): Promise<KnowledgeDraftView | null>;
  saveKnowledgeDraft(input: SaveKnowledgeDraftInput): Promise<boolean>;
  publishKnowledge(input: PublishKnowledgeInput): Promise<boolean>;
  createKnowledgeVersion(packageId: string): Promise<KnowledgeDraftView | null>;
  startAnalysis(input: StartAnalysisInput): Promise<string | null>;
  retryTask(taskId: string): Promise<boolean>;
  ignoreFinding(input: IgnoreFindingInput): Promise<boolean>;
  updateSettings(input: SaveSettingsInput): Promise<boolean>;
  testModel(
    input: TestModelInput,
  ): Promise<{ latencyMs: number; model: string } | null>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);
const AppActionsContext = createContext<AppActionsContextValue | null>(null);

function replaceById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<AppError | null>(null);
  const bridge = window.designx;

  const capture = useCallback(<T,>(result: import('../../shared/types').Result<T>) => {
    if (result.ok) {
      setLastError(null);
      return result.data;
    }
    setLastError(result.error);
    return null;
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!bridge) return false;
    const data = capture(await bridge.workspace.getSnapshot());
    if (!data) return false;
    setSnapshot(data);
    return true;
  }, [bridge, capture]);

  useEffect(() => {
    let active = true;
    if (!bridge) {
      setLastError({
        code: 'DESKTOP_BRIDGE_UNAVAILABLE',
        stage: 'renderer-bootstrap',
        message: '请通过 Electron 桌面应用运行 DesignX。',
        retryable: false,
      });
      setLoading(false);
      return undefined;
    }
    void bridge.workspace.bootstrap().then((result) => {
      if (!active) return;
      const data = capture(result);
      if (data) setSnapshot(data);
      setLoading(false);
    });
    const removeTaskListener = bridge.events.onTaskUpdated(({ task }) => {
      if (!active) return;
      setSnapshot((current) => ({
        ...current,
        tasks: replaceById(current.tasks, task).sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        ),
      }));
      if (
        task.status === 'completed' ||
        task.status === 'partial' ||
        task.status === 'failed'
      ) {
        void bridge.workspace.getSnapshot().then((result) => {
          if (!active) return;
          const data = capture(result);
          if (data) setSnapshot(data);
        });
      }
    });
    const removeRepositoryListener = bridge.events.onRepositoryUpdated(
      ({ repository }) => {
        if (!active) return;
        setSnapshot((current) => ({
          ...current,
          repositories: replaceById(current.repositories, repository),
        }));
      },
    );
    return () => {
      active = false;
      removeTaskListener();
      removeRepositoryListener();
    };
  }, [bridge, capture]);

  const actions = useMemo<AppActionsContextValue>(
    () => ({
      clearError: () => setLastError(null),
      refreshSnapshot,
      selectWorkspace: async () => {
        if (!bridge) return false;
        const selection = capture(await bridge.workspace.select());
        if (!selection) return false;
        setSnapshot(selection.snapshot);
        return true;
      },
      switchWorkspace: async (path) => {
        if (!bridge) return false;
        const next = capture(await bridge.workspace.switch({ path }));
        if (!next) return false;
        setSnapshot(next);
        return true;
      },
      addRepository: async (input) => {
        if (!bridge) return false;
        const repository = capture(await bridge.repositories.add(input));
        if (!repository) return false;
        setSnapshot((current) => ({
          ...current,
          repositories: replaceById(current.repositories, repository),
        }));
        return true;
      },
      syncRepository: async (repositoryId) => {
        if (!bridge) return false;
        const repository = capture(
          await bridge.repositories.sync({ repositoryId }),
        );
        if (!repository) return false;
        setSnapshot((current) => ({
          ...current,
          repositories: replaceById(current.repositories, repository),
        }));
        return true;
      },
      refreshRepository: async (repositoryId) => {
        if (!bridge) return false;
        const repository = capture(
          await bridge.repositories.refresh({ repositoryId }),
        );
        if (!repository) return false;
        setSnapshot((current) => ({
          ...current,
          repositories: replaceById(current.repositories, repository),
        }));
        return true;
      },
      chooseKnowledgeFiles: async () => {
        if (!bridge) return [];
        return capture(await bridge.knowledge.chooseFiles()) ?? [];
      },
      importKnowledge: async (input) => {
        if (!bridge) return null;
        const draft = capture(await bridge.knowledge.import(input));
        if (draft) await refreshSnapshot();
        return draft;
      },
      saveKnowledgeDraft: async (input) => {
        if (!bridge) return false;
        const knowledgePackage = capture(
          await bridge.knowledge.saveDraft(input),
        );
        if (!knowledgePackage) return false;
        setSnapshot((current) => ({
          ...current,
          knowledgePackages: replaceById(
            current.knowledgePackages,
            knowledgePackage,
          ),
        }));
        return true;
      },
      publishKnowledge: async (input) => {
        if (!bridge) return false;
        const knowledgePackage = capture(
          await bridge.knowledge.publish(input),
        );
        if (!knowledgePackage) return false;
        setSnapshot((current) => ({
          ...current,
          knowledgePackages: replaceById(
            current.knowledgePackages,
            knowledgePackage,
          ),
        }));
        return true;
      },
      createKnowledgeVersion: async (packageId) => {
        if (!bridge) return null;
        const draft = capture(
          await bridge.knowledge.createVersion({ packageId }),
        );
        if (draft) await refreshSnapshot();
        return draft;
      },
      startAnalysis: async (input) => {
        if (!bridge) return null;
        const task = capture(await bridge.analysis.start(input));
        if (!task) return null;
        setSnapshot((current) => ({
          ...current,
          tasks: replaceById(current.tasks, task),
        }));
        return task.id;
      },
      retryTask: async (taskId) => {
        if (!bridge) return false;
        const task = capture(await bridge.analysis.retry({ taskId }));
        if (!task) return false;
        setSnapshot((current) => ({
          ...current,
          tasks: replaceById(current.tasks, task),
        }));
        return true;
      },
      ignoreFinding: async (input) => {
        if (!bridge) return false;
        const result = await bridge.findings.ignore(input);
        if (!capture(result)) {
          if (result.ok) {
            setSnapshot((current) => ({
              ...current,
              findings: current.findings.map((finding) =>
                finding.id === input.findingId
                  ? {
                      ...finding,
                      status: 'ignored',
                      ignoredReason: input.reason || undefined,
                    }
                  : finding,
              ),
            }));
            return true;
          }
          return false;
        }
        return true;
      },
      updateSettings: async (input) => {
        if (!bridge) return false;
        const settings = capture(await bridge.settings.save(input));
        if (!settings) return false;
        setSnapshot((current) => ({ ...current, settings }));
        return true;
      },
      testModel: async (input) => {
        if (!bridge) return null;
        return capture(await bridge.settings.testModel(input));
      },
    }),
    [bridge, capture, refreshSnapshot],
  );

  const data = useMemo(
    () => ({ snapshot, loading, lastError }),
    [lastError, loading, snapshot],
  );

  return (
    <AppDataContext.Provider value={data}>
      <AppActionsContext.Provider value={actions}>
        {children}
      </AppActionsContext.Provider>
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppStateProvider');
  return context;
}

export function useAppActions(): AppActionsContextValue {
  const context = useContext(AppActionsContext);
  if (!context) throw new Error('useAppActions must be used inside AppStateProvider');
  return context;
}
