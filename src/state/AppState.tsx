import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { initialSnapshot, primaryFinding } from '../data/seed';
import type {
  AnalysisTask,
  AppSettings,
  AppSnapshot,
  NewAnalysisInput,
  NewKnowledgeInput,
  NewRepositoryInput,
} from '../types';

const STORAGE_KEY = 'designx.app-state.v1';

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function loadSnapshot(): AppSnapshot {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialSnapshot;
    const parsed = JSON.parse(stored) as AppSnapshot;
    return parsed.version === 1 ? parsed : initialSnapshot;
  } catch {
    return initialSnapshot;
  }
}

function currentTimeLabel() {
  return `今天 ${new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())}`;
}

function nextVersion(version: string) {
  const match = /^v(\d+)\.(\d+)$/.exec(version);
  if (!match) return 'v1.0';
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

interface AppStateContextValue extends AppSnapshot {
  addRepository: (input: NewRepositoryInput) => void;
  syncRepository: (repositoryId: string) => void;
  addKnowledgePackage: (input: NewKnowledgeInput) => void;
  startAnalysis: (input: NewAnalysisInput) => string;
  retryTask: (taskId: string) => void;
  ignoreFinding: (findingId: string, reason: string) => void;
  updateSettings: (settings: AppSettings) => void;
  resetDemoData: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(loadSnapshot);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [snapshot]);

  const hasAutoRunningTask = snapshot.tasks.some(
    (task) => task.autoAdvance && (task.status === 'queued' || task.status === 'running'),
  );

  useEffect(() => {
    if (!hasAutoRunningTask) return undefined;

    const interval = window.setInterval(() => {
      setSnapshot((current) => {
        const completedTaskIds: string[] = [];
        const tasks = current.tasks.map((task) => {
          if (!task.autoAdvance || (task.status !== 'queued' && task.status !== 'running')) {
            return task;
          }

          const nextProgress = Math.min(100, task.progress + 13);
          const status: AnalysisTask['status'] =
            nextProgress >= 100 ? 'completed' : 'running';
          let stage = '正在读取 Git Diff';
          if (nextProgress >= 38) stage = '正在选择相关知识';
          if (nextProgress >= 62) stage = '正在分析变更影响';
          if (nextProgress >= 84) stage = '正在校验模型输出';
          if (nextProgress >= 100) {
            stage = '已完成';
            completedTaskIds.push(task.id);
          }

          return {
            ...task,
            status,
            stage,
            progress: nextProgress,
            findingCount: status === 'completed' ? 1 : null,
            duration: status === 'completed' ? '52s' : task.duration,
            autoAdvance: status !== 'completed',
          };
        });

        if (completedTaskIds.length === 0) return { ...current, tasks };

        const newFindings = completedTaskIds
          .filter((taskId) => !current.findings.some((finding) => finding.taskId === taskId))
          .map((taskId) => {
            const task = tasks.find((item) => item.id === taskId)!;
            return {
              ...primaryFinding,
              id: createId('finding'),
              taskId,
              repositoryId: task.repositoryId,
              repositoryName: task.repositoryName,
              title: task.focus
                ? `检查范围“${task.focus.slice(0, 14)}”存在一致性偏差`
                : primaryFinding.title,
            };
          });

        return {
          ...current,
          tasks,
          findings: [...newFindings, ...current.findings],
        };
      });
    }, 900);

    return () => window.clearInterval(interval);
  }, [hasAutoRunningTask]);

  const addRepository = useCallback((input: NewRepositoryInput) => {
    setSnapshot((current) => ({
      ...current,
      repositories: [
        {
          id: createId('repo'),
          name: input.name.trim(),
          remoteUrl: input.remoteUrl.trim(),
          branch: input.branch.trim() || 'main',
          commit: '尚未同步',
          lastSync: '等待首次同步',
          status: 'clean',
          localPath: `repositories/${input.name.trim()}`,
        },
        ...current.repositories,
      ],
    }));
  }, []);

  const syncRepository = useCallback((repositoryId: string) => {
    setSnapshot((current) => ({
      ...current,
      repositories: current.repositories.map((repository) =>
        repository.id === repositoryId
          ? { ...repository, status: 'syncing', error: undefined }
          : repository,
      ),
    }));

    window.setTimeout(() => {
      setSnapshot((current) => ({
        ...current,
        repositories: current.repositories.map((repository) =>
          repository.id === repositoryId
            ? {
                ...repository,
                status: 'clean',
                lastSync: currentTimeLabel(),
                commit:
                  repository.commit === '尚未同步'
                    ? Math.random().toString(16).slice(2, 9)
                    : repository.commit,
              }
            : repository,
        ),
      }));
    }, 1200);
  }, []);

  const addKnowledgePackage = useCallback((input: NewKnowledgeInput) => {
    setSnapshot((current) => {
      const sameName = current.knowledgePackages.find(
        (knowledgePackage) => knowledgePackage.name === input.name,
      );
      const version =
        input.publish && sameName ? nextVersion(sameName.version) : input.publish ? 'v1.0' : '草稿';

      return {
        ...current,
        knowledgePackages: [
          {
            id: createId('knowledge'),
            name: input.name.trim(),
            type: input.type,
            version,
            status: input.publish ? 'published' : 'draft',
            scope: input.scope.trim(),
            updatedAt: currentTimeLabel(),
            sourceFiles: input.sourceFiles,
          },
          ...current.knowledgePackages,
        ],
      };
    });
  }, []);

  const startAnalysis = useCallback((input: NewAnalysisInput) => {
    const taskId = createId('task');
    setSnapshot((current) => {
      const repository = current.repositories.find(
        (item) => item.id === input.repositoryId,
      );
      const knowledge = current.knowledgePackages
        .filter((item) => input.knowledgeIds.includes(item.id))
        .map((item) => `${item.name} ${item.version}`);

      return {
        ...current,
        tasks: [
          {
            id: taskId,
            repositoryId: input.repositoryId,
            repositoryName: repository?.name ?? '未知代码仓',
            branch: input.branch,
            range: input.range,
            knowledge,
            status: 'queued',
            stage: '正在准备本地工作区',
            progress: 8,
            findingCount: null,
            duration: '< 1m',
            startedAt: currentTimeLabel(),
            focus: input.focus.trim(),
            autoAdvance: true,
          },
          ...current.tasks,
        ],
      };
    });
    return taskId;
  }, []);

  const retryTask = useCallback((taskId: string) => {
    setSnapshot((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'queued',
              stage: '正在准备本地工作区',
              progress: 8,
              findingCount: null,
              duration: '< 1m',
              startedAt: currentTimeLabel(),
              autoAdvance: true,
              error: undefined,
            }
          : task,
      ),
    }));
  }, []);

  const ignoreFinding = useCallback((findingId: string, reason: string) => {
    setSnapshot((current) => ({
      ...current,
      findings: current.findings.map((finding) =>
        finding.id === findingId
          ? {
              ...finding,
              status: 'ignored',
              ignoredReason: reason.trim() || '未填写原因',
            }
          : finding,
      ),
    }));
  }, []);

  const updateSettings = useCallback((settings: AppSettings) => {
    setSnapshot((current) => ({ ...current, settings }));
  }, []);

  const resetDemoData = useCallback(() => {
    setSnapshot(initialSnapshot);
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      ...snapshot,
      addRepository,
      syncRepository,
      addKnowledgePackage,
      startAnalysis,
      retryTask,
      ignoreFinding,
      updateSettings,
      resetDemoData,
    }),
    [
      snapshot,
      addRepository,
      syncRepository,
      addKnowledgePackage,
      startAnalysis,
      retryTask,
      ignoreFinding,
      updateSettings,
      resetDemoData,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside AppStateProvider');
  return context;
}
