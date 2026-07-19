import { useMemo, useState } from 'react';
import {
  BookOpen,
  FileUp,
  PencilLine,
  Plus,
  Search,
} from 'lucide-react';
import { useAppActions, useAppData } from '../../state/AppState';
import type { KnowledgeDraftView } from '../../../shared/types';
import type { KnowledgeType } from '../../types';
import { Button } from '../../components/primitives/Button';
import { Input, Select } from '../../components/primitives/FormField';
import { Status } from '../../components/primitives/Status';
import { formatDateTime } from '../../lib/format';
import { ImportKnowledgeModal } from './ImportKnowledgeModal';

interface KnowledgePageProps {
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
}

export function KnowledgePage({
  importOpen,
  onImportOpenChange,
}: KnowledgePageProps) {
  const { snapshot } = useAppData();
  const { createKnowledgeVersion } = useAppActions();
  const { knowledgePackages } = snapshot;
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'全部类型' | KnowledgeType>('全部类型');
  const [editingDraft, setEditingDraft] = useState<KnowledgeDraftView | null>(
    null,
  );

  const filteredPackages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return knowledgePackages.filter((knowledgePackage) => {
      const matchesQuery =
        !query ||
        knowledgePackage.name.toLowerCase().includes(query) ||
        knowledgePackage.scope.toLowerCase().includes(query);
      const matchesType = type === '全部类型' || knowledgePackage.type === type;
      return matchesQuery && matchesType;
    });
  }, [knowledgePackages, search, type]);

  return (
    <div className="page page--knowledge">
      <header className="page-header">
        <div>
          <h1>知识库</h1>
          <p>版本化管理需求、设计与编程规范。</p>
        </div>
        <Button
          onClick={() => {
            setEditingDraft(null);
            onImportOpenChange(true);
          }}
          variant="primary"
        >
          <FileUp aria-hidden="true" size={15} />
          导入文档
        </Button>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={15} />
          <Input
            aria-label="搜索知识包"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索知识包名称"
            value={search}
          />
        </label>
        <Select
          aria-label="知识类型"
          onChange={(event) =>
            setType(event.target.value as '全部类型' | KnowledgeType)
          }
          value={type}
        >
          <option>全部类型</option>
          <option>业务需求</option>
          <option>系统设计</option>
          <option>编程规范</option>
        </Select>
        <span className="toolbar__summary">{filteredPackages.length} 个知识包</span>
      </div>

      <section aria-label="知识包列表" className="data-table knowledge-table">
        <div className="data-table__header knowledge-grid">
          <span>名称</span>
          <span>类型</span>
          <span>版本</span>
          <span>状态</span>
          <span>适用范围</span>
          <span>更新时间</span>
          <span aria-label="操作" />
        </div>
        {filteredPackages.map((knowledgePackage) => (
          <div
            className="data-table__row knowledge-grid"
            key={knowledgePackage.id}
          >
            <span className="knowledge-name-cell">
              <BookOpen aria-hidden="true" size={17} />
              <strong>{knowledgePackage.name}</strong>
            </span>
            <span>{knowledgePackage.type}</span>
            <code>{knowledgePackage.version}</code>
            <Status value={knowledgePackage.status} />
            <code>{knowledgePackage.scope}</code>
            <span>{formatDateTime(knowledgePackage.updatedAt)}</span>
            <span className="row-actions">
              <button
                aria-label={
                  knowledgePackage.hasDraft
                    ? `继续草稿 ${knowledgePackage.name}`
                    : `创建新版本 ${knowledgePackage.name}`
                }
                className="table-action-button"
                onClick={async () => {
                  const draft = await createKnowledgeVersion(knowledgePackage.id);
                  if (!draft) return;
                  setEditingDraft(draft);
                  onImportOpenChange(true);
                }}
                type="button"
              >
                {knowledgePackage.hasDraft ? (
                  <PencilLine aria-hidden="true" size={14} />
                ) : (
                  <Plus aria-hidden="true" size={14} />
                )}
                {knowledgePackage.hasDraft ? '继续草稿' : '创建新版本'}
              </button>
            </span>
          </div>
        ))}
        {filteredPackages.length === 0 ? (
          <div className="empty-state">
            <h3>没有匹配的知识包</h3>
            <p>调整搜索条件，或导入一份需求、设计或编程规范。</p>
            <Button
              onClick={() => {
                setEditingDraft(null);
                onImportOpenChange(true);
              }}
            >
              导入文档
            </Button>
          </div>
        ) : null}
      </section>

      <ImportKnowledgeModal
        initialDraft={editingDraft}
        onClose={() => onImportOpenChange(false)}
        open={importOpen}
      />
    </div>
  );
}
