import {
  BookUp2,
  CheckCircle2,
  MonitorCog,
  RefreshCw,
  ScanSearch,
} from 'lucide-react';
import { AnalysisComposer } from './AnalysisComposer';
import { useAppActions, useAppData } from '../../state/AppState';
import type { NavigationId } from '../../types';
import { Status } from '../../components/primitives/Status';
import { formatDateTime } from '../../lib/format';

interface AnalysisHomeProps {
  onNavigate: (page: NavigationId) => void;
  onOpenKnowledgeImport: () => void;
}

export function AnalysisHome({
  onNavigate,
  onOpenKnowledgeImport,
}: AnalysisHomeProps) {
  const { snapshot } = useAppData();
  const { syncRepository } = useAppActions();
  const { tasks, repositories } = snapshot;
  const recentTasks = tasks.slice(0, 3);

  return (
    <div className="analysis-page">
      <div className="analysis-page__scroll">
        <header className="analysis-page__topline">
          <h1>新建分析</h1>
          <span>
            <MonitorCog aria-hidden="true" size={15} />
            本地模式 · 仅在本机运行
          </span>
        </header>

        <section className="analysis-hero">
          <h2>今天想检查哪个代码变更？</h2>
          <p>对照代码变更与已发布约束，生成可追溯的一致性发现。</p>
          <div className="quick-actions">
            <button
              onClick={() => {
                if (repositories[0]) void syncRepository(repositories[0].id);
              }}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={18} />
              <span>同步代码仓</span>
            </button>
            <button onClick={onOpenKnowledgeImport} type="button">
              <BookUp2 aria-hidden="true" size={18} />
              <span>导入规范文档</span>
            </button>
            <button
              onClick={() =>
                document
                  .querySelector<HTMLTextAreaElement>('[aria-label="分析关注点"]')
                  ?.focus()
              }
              type="button"
            >
              <ScanSearch aria-hidden="true" size={18} />
              <span>运行一致性分析</span>
            </button>
          </div>
        </section>

        <section className="recent-analysis">
          <div className="section-heading">
            <h3>最近分析</h3>
            <button onClick={() => onNavigate('tasks')} type="button">
              查看全部
            </button>
          </div>
          <div className="recent-analysis__table">
            <div className="recent-analysis__head">
              <span>代码仓</span>
              <span>提交范围</span>
              <span>状态</span>
              <span>发现数</span>
              <span>时间</span>
            </div>
            {recentTasks.map((task) => (
              <button
                className="recent-analysis__row"
                key={task.id}
                onClick={() => onNavigate('tasks')}
                type="button"
              >
                <span className="recent-analysis__repo">
                  <span aria-hidden="true" className="row-icon">
                    {task.status === 'completed' ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <ScanSearch size={14} />
                    )}
                  </span>
                  {task.repositoryName}
                </span>
                <code>{task.rangeLabel}</code>
                <span className="recent-analysis__status">
                  <Status value={task.status} />
                  {task.status === 'running' ? (
                    <>
                      <span className="progress progress--compact">
                        <span style={{ transform: `scaleX(${task.progress / 100})` }} />
                      </span>
                      <small>{task.stage}</small>
                    </>
                  ) : null}
                </span>
                <span>{task.findingCount ?? '—'}</span>
                <span>{formatDateTime(task.startedAt)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <AnalysisComposer onNavigate={onNavigate} />
    </div>
  );
}
