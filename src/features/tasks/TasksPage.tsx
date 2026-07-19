import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  GitCompareArrows,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import type { NavigationId, TaskStatus } from '../../types';
import { Button } from '../../components/primitives/Button';
import { Input, Select } from '../../components/primitives/FormField';
import { Status } from '../../components/primitives/Status';

interface TasksPageProps {
  onNavigate: (page: NavigationId) => void;
}

export function TasksPage({ onNavigate }: TasksPageProps) {
  const { tasks, retryTask } = useAppState();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [selectedId, setSelectedId] = useState(() => tasks[0]?.id ?? '');

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery =
        !query ||
        task.repositoryName.toLowerCase().includes(query) ||
        task.range.toLowerCase().includes(query) ||
        task.focus.toLowerCase().includes(query);
      const matchesStatus = status === 'all' || task.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [search, status, tasks]);

  const selectedTask =
    tasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? tasks[0];

  return (
    <div className="page page--tasks">
      <header className="page-header">
        <div>
          <h1>分析任务</h1>
          <p>查看固定输入、执行阶段与已加载的知识版本。</p>
        </div>
        <Button onClick={() => onNavigate('analysis')} variant="primary">
          新建分析
        </Button>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={15} />
          <Input
            aria-label="搜索分析任务"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索代码仓、范围或关注点"
            value={search}
          />
        </label>
        <Select
          aria-label="任务状态"
          onChange={(event) =>
            setStatus(event.target.value as 'all' | TaskStatus)
          }
          value={status}
        >
          <option value="all">全部状态</option>
          <option value="queued">排队中</option>
          <option value="running">分析中</option>
          <option value="completed">已完成</option>
          <option value="partial">部分失败</option>
          <option value="failed">失败</option>
        </Select>
        <span className="toolbar__summary">{filteredTasks.length} 个任务</span>
      </div>

      <div className="tasks-layout">
        <section aria-label="分析任务列表" className="task-list">
          <div className="task-list__header task-grid">
            <span>代码仓 / 提交范围</span>
            <span>状态</span>
            <span>发现</span>
            <span>耗时</span>
          </div>
          {filteredTasks.map((task) => (
            <button
              className="task-row task-grid"
              data-selected={selectedTask?.id === task.id}
              key={task.id}
              onClick={() => setSelectedId(task.id)}
              type="button"
            >
              <span className="task-row__primary">
                <strong>{task.repositoryName}</strong>
                <code>{task.range}</code>
              </span>
              <span className="task-row__state">
                <Status value={task.status} />
                {task.status === 'running' || task.status === 'queued' ? (
                  <span className="progress">
                    <span style={{ transform: `scaleX(${task.progress / 100})` }} />
                  </span>
                ) : null}
              </span>
              <span>{task.findingCount ?? '—'}</span>
              <span className="task-row__time">
                {task.duration}
                <ChevronRight aria-hidden="true" size={15} />
              </span>
            </button>
          ))}
          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <h3>没有匹配的分析任务</h3>
              <p>调整筛选条件，或发起一次新的一致性分析。</p>
            </div>
          ) : null}
        </section>

        {selectedTask ? (
          <aside className="task-detail">
            <header className="task-detail__header">
              <div>
                <span>{selectedTask.startedAt}</span>
                <h2>{selectedTask.repositoryName}</h2>
              </div>
              <Status value={selectedTask.status} />
            </header>

            <section className="task-stage">
              <div className="task-stage__title">
                <strong>{selectedTask.stage}</strong>
                <span>{selectedTask.progress}%</span>
              </div>
              <span className="progress progress--large">
                <span
                  style={{ transform: `scaleX(${selectedTask.progress / 100})` }}
                />
              </span>
              <div className="task-stage__steps">
                {[
                  ['准备工作区', 8],
                  ['读取 Git Diff', 24],
                  ['选择知识', 44],
                  ['分析影响', 68],
                  ['校验输出', 88],
                ].map(([label, threshold]) => (
                  <span
                    data-complete={selectedTask.progress >= Number(threshold)}
                    key={label}
                  >
                    <i>
                      {selectedTask.progress >= Number(threshold) ? (
                        <Check aria-hidden="true" size={11} />
                      ) : null}
                    </i>
                    {label}
                  </span>
                ))}
              </div>
            </section>

            {selectedTask.error ? (
              <div className="task-error">
                <AlertCircle aria-hidden="true" size={17} />
                <div>
                  <strong>{selectedTask.stage}</strong>
                  <p>{selectedTask.error}</p>
                </div>
              </div>
            ) : null}

            <dl className="task-metadata">
              <div>
                <dt>
                  <GitCompareArrows aria-hidden="true" size={14} />
                  分析范围
                </dt>
                <dd>
                  <code>{selectedTask.range}</code>
                  <small>
                    {selectedTask.repositoryName} / {selectedTask.branch}
                  </small>
                </dd>
              </div>
              <div>
                <dt>
                  <BookOpen aria-hidden="true" size={14} />
                  实际加载的知识
                </dt>
                <dd>
                  {selectedTask.knowledge.map((knowledge) => (
                    <span key={knowledge}>{knowledge}</span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>
                  <Search aria-hidden="true" size={14} />
                  补充检查范围
                </dt>
                <dd>{selectedTask.focus || '未补充额外检查范围'}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 aria-hidden="true" size={14} />
                  开始时间
                </dt>
                <dd>{selectedTask.startedAt}</dd>
              </div>
            </dl>

            <div className="task-detail__actions">
              {selectedTask.status === 'failed' ||
              selectedTask.status === 'partial' ? (
                <Button onClick={() => retryTask(selectedTask.id)} variant="primary">
                  <RefreshCw aria-hidden="true" size={15} />
                  重新运行
                </Button>
              ) : null}
              {selectedTask.status === 'completed' ? (
                <Button onClick={() => onNavigate('findings')} variant="primary">
                  查看 {selectedTask.findingCount} 条发现
                </Button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
