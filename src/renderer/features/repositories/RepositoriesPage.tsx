import { useMemo, useState } from 'react';
import {
  AlertCircle,
  GitBranch,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAppActions, useAppData } from '../../state/AppState';
import { AddRepositoryModal } from './AddRepositoryModal';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/FormField';
import { Status } from '../../components/primitives/Status';
import { formatDateTime } from '../../lib/format';

export function RepositoriesPage() {
  const { snapshot } = useAppData();
  const { syncRepository } = useAppActions();
  const { repositories } = snapshot;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  const filteredRepositories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter(
      (repository) =>
        repository.name.toLowerCase().includes(query) ||
        repository.remoteUrl.toLowerCase().includes(query),
    );
  }, [repositories, search]);

  const sync = (repositoryId: string) => {
    setFeedbackId(repositoryId);
    void syncRepository(repositoryId);
  };

  return (
    <div className="page page--repositories">
      <header className="page-header">
        <div>
          <h1>代码仓</h1>
          <p>管理本地副本、默认分支与手动同步。</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus aria-hidden="true" size={15} />
          添加代码仓
        </Button>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={15} />
          <Input
            aria-label="搜索代码仓"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称或 Git 地址"
            value={search}
          />
        </label>
        <span className="toolbar__summary">{filteredRepositories.length} 个代码仓</span>
      </div>

      <section aria-label="代码仓列表" className="data-table repository-table">
        <div className="data-table__header repository-grid">
          <span>代码仓</span>
          <span>默认分支</span>
          <span>当前 Commit</span>
          <span>Git 状态</span>
          <span>最近同步</span>
          <span aria-label="操作" />
        </div>
        {filteredRepositories.map((repository) => (
          <div className="data-table__row-wrap" key={repository.id}>
            <div className="data-table__row repository-grid">
              <span className="repository-name-cell">
                <strong>{repository.name}</strong>
                <small title={repository.remoteUrl}>{repository.remoteUrl}</small>
              </span>
              <span>
                <GitBranch aria-hidden="true" size={14} />
                {repository.branch}
              </span>
              <code>{repository.commit}</code>
              <Status value={repository.status} />
              <span>{formatDateTime(repository.lastSync)}</span>
              <span className="row-actions">
                <button
                  aria-label={`同步 ${repository.name}`}
                  className="icon-button"
                  disabled={repository.status === 'syncing'}
                  onClick={() => sync(repository.id)}
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={repository.status === 'syncing' ? 'is-spinning' : ''}
                    size={16}
                  />
                </button>
                <button
                  aria-label={`更多 ${repository.name}`}
                  className="icon-button"
                  type="button"
                >
                  <MoreHorizontal aria-hidden="true" size={17} />
                </button>
              </span>
            </div>
            {repository.error ? (
              <div className="inline-error">
                <AlertCircle aria-hidden="true" size={15} />
                <span>
                  <strong>同步失败：</strong>
                  {repository.error}
                </span>
                <button onClick={() => sync(repository.id)} type="button">
                  重试
                </button>
              </div>
            ) : null}
            {feedbackId === repository.id && repository.status === 'clean' ? (
              <div className="inline-success">
                已保留本地可用版本，并同步到最新 Commit。
              </div>
            ) : null}
          </div>
        ))}
        {filteredRepositories.length === 0 ? (
          <div className="empty-state">
            <h3>没有匹配的代码仓</h3>
            <p>调整搜索条件，或添加一个新的企业 Git 仓库。</p>
          </div>
        ) : null}
      </section>

      <AddRepositoryModal onClose={() => setModalOpen(false)} open={modalOpen} />
    </div>
  );
}
