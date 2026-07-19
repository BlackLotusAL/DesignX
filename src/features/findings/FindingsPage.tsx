import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Code2,
  FileCode2,
  GitCommitHorizontal,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import type {
  FindingSeverity,
  FindingStatus,
  Finding as FindingType,
} from '../../types';
import { Button } from '../../components/primitives/Button';
import { Input, Select } from '../../components/primitives/FormField';
import { Status } from '../../components/primitives/Status';
import { IgnoreFindingModal } from './IgnoreFindingModal';

type FindingCategory =
  | 'all'
  | '代码质量'
  | '编程规范'
  | '业务需求一致性'
  | '系统设计一致性';

export function FindingsPage() {
  const { findings, repositories, tasks, ignoreFinding } = useAppState();
  const [search, setSearch] = useState('');
  const [repositoryId, setRepositoryId] = useState('all');
  const [taskId, setTaskId] = useState('all');
  const [category, setCategory] = useState<FindingCategory>('all');
  const [severity, setSeverity] = useState<'all' | FindingSeverity>('all');
  const [status, setStatus] = useState<'all' | FindingStatus>('open');
  const [selectedId, setSelectedId] = useState(
    () => findings.find((finding) => finding.status === 'open')?.id ?? findings[0]?.id,
  );
  const [ignoreOpen, setIgnoreOpen] = useState(false);

  const filteredFindings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return findings
      .filter((finding) => {
        const matchesQuery =
          !query ||
          finding.title.toLowerCase().includes(query) ||
          finding.file.toLowerCase().includes(query) ||
          finding.knownFact.toLowerCase().includes(query);
        const matchesRepository =
          repositoryId === 'all' || finding.repositoryId === repositoryId;
        const matchesTask = taskId === 'all' || finding.taskId === taskId;
        const matchesCategory = category === 'all' || finding.type === category;
        const matchesSeverity = severity === 'all' || finding.severity === severity;
        const matchesStatus = status === 'all' || finding.status === status;
        return (
          matchesQuery &&
          matchesRepository &&
          matchesTask &&
          matchesCategory &&
          matchesSeverity &&
          matchesStatus
        );
      })
      .sort((a, b) => {
        const severityOrder: Record<FindingSeverity, number> = {
          high: 3,
          medium: 2,
          low: 1,
        };
        return (
          severityOrder[b.severity] - severityOrder[a.severity] ||
          b.confidence - a.confidence
        );
      });
  }, [category, findings, repositoryId, search, severity, status, taskId]);

  const selectedFinding =
    filteredFindings.find((finding) => finding.id === selectedId) ??
    filteredFindings[0] ??
    findings[0];
  const openCount = findings.filter((finding) => finding.status === 'open').length;

  return (
    <div className="findings-page">
      <header className="findings-page__header">
        <h1>发现</h1>
        <div className="findings-filters">
          <label className="search-field search-field--findings">
            <Search aria-hidden="true" size={15} />
            <Input
              aria-label="搜索发现"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索发现标题或内容"
              value={search}
            />
          </label>
          <label>
            <span>代码仓</span>
            <Select
              aria-label="按代码仓筛选"
              onChange={(event) => setRepositoryId(event.target.value)}
              value={repositoryId}
            >
              <option value="all">全部</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span>任务</span>
            <Select
              aria-label="按任务筛选"
              onChange={(event) => setTaskId(event.target.value)}
              value={taskId}
            >
              <option value="all">全部</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.repositoryName} · {task.range}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span>类型</span>
            <Select
              aria-label="按类型筛选"
              onChange={(event) =>
                setCategory(event.target.value as FindingCategory)
              }
              value={category}
            >
              <option value="all">全部</option>
              <option>代码质量</option>
              <option>编程规范</option>
              <option>业务需求一致性</option>
              <option>系统设计一致性</option>
            </Select>
          </label>
          <label>
            <span>严重度</span>
            <Select
              aria-label="按严重度筛选"
              onChange={(event) =>
                setSeverity(event.target.value as 'all' | FindingSeverity)
              }
              value={severity}
            >
              <option value="all">全部</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </Select>
          </label>
          <label>
            <span>状态</span>
            <Select
              aria-label="按状态筛选"
              onChange={(event) =>
                setStatus(event.target.value as 'all' | FindingStatus)
              }
              value={status}
            >
              <option value="open">待处理</option>
              <option value="ignored">已忽略</option>
              <option value="all">全部</option>
            </Select>
          </label>
          <strong>{openCount} 条待处理</strong>
        </div>
      </header>

      <div className="findings-layout">
        <section aria-label="发现列表" className="finding-list">
          <div className="finding-list__head">
            <span>严重度</span>
            <span>发现</span>
            <span>位置 / 置信度</span>
            <span>状态</span>
          </div>
          <div className="finding-list__body">
            {filteredFindings.map((finding) => (
              <button
                className="finding-row"
                data-selected={selectedFinding?.id === finding.id}
                key={finding.id}
                onClick={() => setSelectedId(finding.id)}
                type="button"
              >
                <Status value={finding.severity} />
                <span className="finding-row__content">
                  <strong>{finding.title}</strong>
                  <small>{finding.type}</small>
                  <code>
                    {finding.file.split('/').slice(-3).join('/')}:{finding.line}
                  </code>
                </span>
                <span className="finding-row__confidence">{finding.confidence}%</span>
                <span className="finding-row__status">
                  <Status value={finding.status} />
                </span>
              </button>
            ))}
            {filteredFindings.length === 0 ? (
              <div className="empty-state">
                <h3>没有匹配的发现</h3>
                <p>调整筛选条件，或切换到“全部”状态查看历史结果。</p>
              </div>
            ) : null}
          </div>
        </section>

        {selectedFinding ? (
          <FindingDetail
            finding={selectedFinding}
            onIgnore={() => setIgnoreOpen(true)}
          />
        ) : null}
      </div>

      {selectedFinding ? (
        <IgnoreFindingModal
          findingTitle={selectedFinding.title}
          onClose={() => setIgnoreOpen(false)}
          onConfirm={(reason) => ignoreFinding(selectedFinding.id, reason)}
          open={ignoreOpen}
        />
      ) : null}
    </div>
  );
}

function FindingDetail({
  finding,
  onIgnore,
}: {
  finding: FindingType;
  onIgnore: () => void;
}) {
  return (
    <article className="finding-detail">
      <header className="finding-detail__title">
        <div>
          <h2>{finding.title}</h2>
          <span className="finding-detail__title-meta">
            <Status value={finding.severity} />
            <i />
            置信度 {finding.confidence}%
            <i />
            {finding.type}
          </span>
        </div>
        <Button
          disabled={finding.status === 'ignored'}
          onClick={onIgnore}
          variant="secondary"
        >
          {finding.status === 'ignored' ? '已忽略' : '忽略发现'}
        </Button>
      </header>

      <section className="finding-reasoning">
        <p>
          <strong>已知事实</strong>
          {finding.knownFact}
        </p>
        <p>
          <strong>模型推断</strong>
          {finding.inference}
        </p>
      </section>

      <div className="evidence-grid">
        <section className="evidence evidence--code">
          <header>
            <h3>
              <Code2 aria-hidden="true" size={16} />
              代码证据
            </h3>
            <span>
              <FileCode2 aria-hidden="true" size={13} />
              {finding.file}
            </span>
            <span>行 {finding.lineRange}</span>
            <span>
              <GitCommitHorizontal aria-hidden="true" size={13} />
              {finding.commit}
            </span>
          </header>
          <pre className="code-evidence">
            {finding.codeLines.map((line) => (
              <span data-highlight={line.highlight} key={line.number}>
                <i>{line.number}</i>
                <code>{line.content || ' '}</code>
              </span>
            ))}
          </pre>
        </section>

        <section className="evidence evidence--knowledge">
          <header>
            <h3>
              <BookOpen aria-hidden="true" size={16} />
              知识证据
            </h3>
            <span>{finding.knowledge.packageName}</span>
            <span>{finding.knowledge.version}</span>
            <span>{finding.knowledge.section}</span>
          </header>
          <div className="knowledge-evidence">
            <h4>{finding.knowledge.section}</h4>
            <blockquote>{finding.knowledge.excerpt}</blockquote>
            <div className="knowledge-requirements">
              <strong>约束要点</strong>
              <span>
                <CheckCircle2 aria-hidden="true" size={14} />
                处理回调前按唯一业务键校验
              </span>
              <span>
                <CheckCircle2 aria-hidden="true" size={14} />
                已处理请求不得重复执行业务写操作
              </span>
              <span>
                <CheckCircle2 aria-hidden="true" size={14} />
                处理状态需要可追溯
              </span>
            </div>
          </div>
          <footer>
            来源：{finding.knowledge.sourcePath}
            <ArrowUpRight aria-hidden="true" size={14} />
          </footer>
        </section>
      </div>

      <section className="finding-suggestions">
        <h3>
          <ShieldAlert aria-hidden="true" size={16} />
          修改建议
        </h3>
        <ol>
          {finding.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ol>
      </section>
    </article>
  );
}
