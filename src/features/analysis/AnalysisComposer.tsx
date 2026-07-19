import { useMemo, useState } from 'react';
import {
  BookOpen,
  Box,
  GitBranch,
  GitCompareArrows,
  Layers3,
  PackageOpen,
  Play,
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import type { NavigationId } from '../../types';
import { Button } from '../../components/primitives/Button';
import { Select, Textarea } from '../../components/primitives/FormField';

interface AnalysisComposerProps {
  onNavigate: (page: NavigationId) => void;
}

export function AnalysisComposer({ onNavigate }: AnalysisComposerProps) {
  const {
    repositories,
    knowledgePackages,
    tasks,
    settings,
    startAnalysis,
  } = useAppState();
  const publishedKnowledge = useMemo(
    () => knowledgePackages.filter((item) => item.status === 'published'),
    [knowledgePackages],
  );

  const [repositoryId, setRepositoryId] = useState(
    () => repositories[0]?.id ?? '',
  );
  const [primaryKnowledgeId, setPrimaryKnowledgeId] = useState(
    () => publishedKnowledge[0]?.id ?? '',
  );
  const [secondaryKnowledgeId, setSecondaryKnowledgeId] = useState(
    () => publishedKnowledge[1]?.id ?? '',
  );
  const [range, setRange] = useState('上次成功分析 → 当前提交');
  const [focus, setFocus] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const repository =
    repositories.find((item) => item.id === repositoryId) ?? repositories[0];
  const runningTask = tasks.find(
    (task) =>
      task.repositoryId === repository?.id &&
      (task.status === 'queued' || task.status === 'running'),
  );
  const missingInput = !repository || !primaryKnowledgeId;

  const submit = () => {
    if (missingInput) {
      setNotice(
        !repository
          ? '请先添加一个可用代码仓。'
          : '请先发布至少一个知识版本。',
      );
      return;
    }

    if (runningTask) {
      setNotice(`代码仓 ${repository.name} 已有运行中的任务，已为你定位到现有任务。`);
      onNavigate('tasks');
      return;
    }

    const knowledgeIds = [primaryKnowledgeId, secondaryKnowledgeId].filter(
      (id, index, ids) => id && ids.indexOf(id) === index,
    );

    startAnalysis({
      repositoryId: repository.id,
      branch: repository.branch,
      knowledgeIds,
      range,
      focus,
    });
    setNotice(null);
    onNavigate('tasks');
  };

  return (
    <section aria-label="新建一致性分析" className="analysis-composer">
      <div className="analysis-composer__input-wrap">
        <Textarea
          aria-label="分析关注点"
          onChange={(event) => setFocus(event.target.value)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="描述要检查的模块、目录、变更或关注点…"
          value={focus}
        />
        <span className="analysis-composer__input-icon" title="自然语言分析范围">
          <Layers3 aria-hidden="true" size={16} />
        </span>
      </div>

      {notice ? (
        <button
          className="analysis-composer__notice"
          onClick={() => {
            if (runningTask) onNavigate('tasks');
          }}
          type="button"
        >
          {notice}
        </button>
      ) : null}

      <div className="analysis-composer__controls">
        <label className="composer-control composer-control--wide">
          <span>
            <PackageOpen aria-hidden="true" size={14} />
            代码仓
          </span>
          <Select
            aria-label="代码仓"
            onChange={(event) => setRepositoryId(event.target.value)}
            value={repository?.id ?? ''}
          >
            {repositories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="composer-control">
          <span>
            <GitBranch aria-hidden="true" size={14} />
            分支
          </span>
          <Select
            aria-label="分支"
            onChange={() => undefined}
            value={repository?.branch ?? 'main'}
          >
            <option>{repository?.branch ?? 'main'}</option>
          </Select>
        </label>

        <label className="composer-control composer-control--knowledge">
          <span>
            <BookOpen aria-hidden="true" size={14} />
            知识版本 1
          </span>
          <Select
            aria-label="主要知识版本"
            onChange={(event) => setPrimaryKnowledgeId(event.target.value)}
            value={primaryKnowledgeId}
          >
            {publishedKnowledge.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.version}
              </option>
            ))}
          </Select>
        </label>

        <label className="composer-control composer-control--knowledge">
          <span>
            <BookOpen aria-hidden="true" size={14} />
            知识版本 2
          </span>
          <Select
            aria-label="补充知识版本"
            onChange={(event) => setSecondaryKnowledgeId(event.target.value)}
            value={secondaryKnowledgeId}
          >
            <option value="">不添加</option>
            {publishedKnowledge.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.version}
              </option>
            ))}
          </Select>
        </label>

        <label className="composer-control composer-control--wide">
          <span>
            <GitCompareArrows aria-hidden="true" size={14} />
            范围
          </span>
          <Select
            aria-label="分析范围"
            onChange={(event) => setRange(event.target.value)}
            value={range}
          >
            <option>上次成功分析 → 当前提交</option>
            <option>当前代码基线</option>
            <option>最近 10 个提交</option>
          </Select>
        </label>

        <label className="composer-control">
          <span>
            <Box aria-hidden="true" size={14} />
            分析模式
          </span>
          <Select aria-label="分析模式" defaultValue="一致性分析">
            <option>一致性分析</option>
          </Select>
        </label>

        <label className="composer-control composer-control--model">
          <span>
            <Box aria-hidden="true" size={14} />
            模型
          </span>
          <Select
            aria-label="模型"
            onChange={() => undefined}
            value={settings.model}
          >
            <option>{settings.model}</option>
          </Select>
        </label>

        <Button
          className="analysis-composer__submit"
          disabled={missingInput}
          onClick={submit}
          variant="primary"
        >
          <Play aria-hidden="true" fill="currentColor" size={14} />
          开始分析
          <kbd>Ctrl ↵</kbd>
        </Button>
      </div>
    </section>
  );
}
