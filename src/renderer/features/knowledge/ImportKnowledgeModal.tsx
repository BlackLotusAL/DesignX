import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  File,
  FileText,
  FolderUp,
  LockKeyhole,
} from 'lucide-react';
import { useAppActions, useAppData } from '../../state/AppState';
import type {
  KnowledgeDraftView,
  KnowledgeType,
  SelectedKnowledgeFile,
} from '../../../shared/types';
import { Button } from '../../components/primitives/Button';
import { FormField, Input, Select } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface ImportKnowledgeModalProps {
  open: boolean;
  initialDraft: KnowledgeDraftView | null;
  onClose: () => void;
}

type ImportStep = 1 | 2 | 3;

function defaultName(files: SelectedKnowledgeFile[]): string {
  return files[0]?.name.replace(/\.(md|pdf|docx)$/i, '') ?? '';
}

export function ImportKnowledgeModal({
  open,
  initialDraft,
  onClose,
}: ImportKnowledgeModalProps) {
  const { lastError } = useAppData();
  const {
    chooseKnowledgeFiles,
    importKnowledge,
    publishKnowledge,
    saveKnowledgeDraft,
  } = useAppActions();
  const [step, setStep] = useState<ImportStep>(1);
  const [files, setFiles] = useState<SelectedKnowledgeFile[]>([]);
  const [draft, setDraft] = useState<KnowledgeDraftView | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<KnowledgeType>('系统设计');
  const [scope, setScope] = useState('**/*');
  const [skillMarkdown, setSkillMarkdown] = useState('');
  const [activeTab, setActiveTab] = useState<'skill' | 'references'>('skill');
  const [result, setResult] = useState<'published' | 'draft'>('published');
  const [resultVersion, setResultVersion] = useState('v1.0');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialDraft) {
      setStep(2);
      setDraft(initialDraft);
      setFiles([]);
      setName(initialDraft.name);
      setType(initialDraft.type);
      setScope(initialDraft.scope);
      setSkillMarkdown(initialDraft.skillMarkdown);
    } else {
      setStep(1);
      setDraft(null);
      setFiles([]);
      setName('');
      setType('系统设计');
      setScope('**/*');
      setSkillMarkdown('');
    }
    setActiveTab('skill');
    setResultVersion(initialDraft?.versionPreview ?? 'v1.0');
    setError(null);
    setWorking(false);
  }, [initialDraft, open]);

  const selectFiles = async () => {
    setWorking(true);
    const selected = await chooseKnowledgeFiles();
    setWorking(false);
    if (selected.length === 0) return;
    setFiles(selected);
    if (!name) setName(defaultName(selected));
    setError(null);
  };

  const goToDraft = async () => {
    if (files.length === 0) {
      setError('请至少选择一个规范文档。');
      return;
    }
    if (!name.trim() || !scope.trim()) {
      setError('请填写知识包名称和适用范围。');
      return;
    }
    setWorking(true);
    const imported = await importKnowledge({
      name: name.trim(),
      type,
      scope: scope.trim(),
      files,
    });
    setWorking(false);
    if (!imported) return;
    setDraft(imported);
    setName(imported.name);
    setType(imported.type);
    setScope(imported.scope);
    setSkillMarkdown(imported.skillMarkdown);
    setResultVersion(imported.versionPreview);
    setError(null);
    setStep(2);
  };

  const save = async (publish: boolean) => {
    if (!draft || !name.trim() || !scope.trim() || !skillMarkdown.trim()) {
      setError('请填写名称、适用范围和非空 SKILL.md。');
      return;
    }
    setWorking(true);
    const input = {
      packageId: draft.packageId,
      name: name.trim(),
      type,
      scope: scope.trim(),
      skillMarkdown,
    };
    const success = publish
      ? await publishKnowledge(input)
      : await saveKnowledgeDraft(input);
    setWorking(false);
    if (!success) return;
    setResultVersion(draft.versionPreview);
    setResult(publish ? 'published' : 'draft');
    setStep(3);
  };

  const footer =
    step === 1 ? (
      <>
        <Button onClick={onClose}>取消</Button>
        <Button loading={working} onClick={() => void goToDraft()} variant="primary">
          生成草稿
        </Button>
      </>
    ) : step === 2 ? (
      <>
        {!initialDraft ? <Button onClick={() => setStep(1)}>返回</Button> : null}
        <div className="modal__footer-spacer" />
        <Button loading={working} onClick={() => void save(false)}>
          保存草稿
        </Button>
        <Button loading={working} onClick={() => void save(true)} variant="primary">
          发布 {draft?.versionPreview ?? 'v1.0'}
        </Button>
      </>
    ) : (
      <Button onClick={onClose} variant="primary">
        完成
      </Button>
    );

  const sourceFiles =
    draft?.sourceFiles.map((path) => path.split('/').at(-1) ?? path) ??
    files.map((file) => file.name);

  return (
    <Modal
      footer={footer}
      onClose={onClose}
      open={open}
      size="large"
      title={initialDraft ? '编辑知识草稿' : '导入规范文档'}
    >
      <div aria-label="导入进度" className="stepper">
        {[
          { number: 1, label: '选择文件' },
          { number: 2, label: '检查草稿' },
          { number: 3, label: '发布版本' },
        ].map((item, index) => (
          <div className="stepper__item" data-active={step === item.number} key={item.number}>
            <span data-complete={step > item.number}>
              {step > item.number ? <Check size={12} /> : item.number}
            </span>
            <strong>{item.label}</strong>
            {index < 2 ? <i aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="import-files">
          <button
            className="file-dropzone"
            disabled={working}
            onClick={() => void selectFiles()}
            type="button"
          >
            <FolderUp aria-hidden="true" size={25} />
            <strong>选择本地文档</strong>
            <span>支持 Markdown、PDF 与 DOCX · 最多 20 个 · 总计 100MB</span>
          </button>
          {files.length > 0 ? (
            <>
              <div className="selected-files">
                {files.map((file) => (
                  <span key={file.path}>
                    <FileText aria-hidden="true" size={15} />
                    {file.name}
                    <small>{(file.size / 1024).toFixed(0)}KB</small>
                    <CheckCircle2 aria-hidden="true" size={14} />
                  </span>
                ))}
              </div>
              <div className="form-grid form-grid--two import-metadata">
                <FormField label="知识包名称">
                  <Input
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </FormField>
                <FormField label="类型">
                  <Select
                    onChange={(event) => setType(event.target.value as KnowledgeType)}
                    value={type}
                  >
                    <option>业务需求</option>
                    <option>系统设计</option>
                    <option>编程规范</option>
                  </Select>
                </FormField>
                <FormField label="适用范围">
                  <Input
                    onChange={(event) => setScope(event.target.value)}
                    placeholder="services/payment/**"
                    value={scope}
                  />
                </FormField>
              </div>
            </>
          ) : null}
          {error || lastError ? (
            <p className="form-error">{error ?? lastError?.message}</p>
          ) : null}
        </div>
      ) : null}

      {step === 2 && draft ? (
        <div className="knowledge-draft">
          <div className="source-summary">
            <span>来源文件：</span>
            {sourceFiles.map((fileName) => (
              <span key={fileName}>
                <File aria-hidden="true" size={14} />
                {fileName}
              </span>
            ))}
            <small>来源与 references 只读</small>
          </div>

          <div className="form-grid form-grid--two">
            <FormField label="知识包名称">
              <Input onChange={(event) => setName(event.target.value)} value={name} />
            </FormField>
            <FormField label="类型">
              <Select
                onChange={(event) => setType(event.target.value as KnowledgeType)}
                value={type}
              >
                <option>业务需求</option>
                <option>系统设计</option>
                <option>编程规范</option>
              </Select>
            </FormField>
            <FormField label="适用范围">
              <Input onChange={(event) => setScope(event.target.value)} value={scope} />
            </FormField>
            <FormField label="版本预览">
              <div className="readonly-field">将发布为 {draft.versionPreview}</div>
            </FormField>
          </div>

          <div className="editor-tabs">
            <button
              data-active={activeTab === 'skill'}
              onClick={() => setActiveTab('skill')}
              type="button"
            >
              SKILL.md
            </button>
            <button
              data-active={activeTab === 'references'}
              onClick={() => setActiveTab('references')}
              type="button"
            >
              references ({draft.references.length})
            </button>
          </div>

          <div className="draft-editor">
            {activeTab === 'skill' ? (
              <textarea
                aria-label="SKILL.md 内容"
                className="skill-editor"
                onChange={(event) => setSkillMarkdown(event.target.value)}
                spellCheck={false}
                value={skillMarkdown}
              />
            ) : (
              <div className="reference-preview">
                {draft.references.map((reference) => (
                  <span key={reference.id}>
                    <FileText aria-hidden="true" size={15} />
                    <strong>{reference.title}</strong>
                    <small>{reference.sourceLocation.label}</small>
                    <CheckCircle2 aria-hidden="true" size={15} />
                  </span>
                ))}
              </div>
            )}
            <aside className="source-mapping">
              <h4>来源映射</h4>
              {draft.references.slice(0, 12).map((reference) => (
                <span key={reference.id}>
                  <FileText aria-hidden="true" size={15} />
                  <strong>{reference.sourcePath.split('/').at(-1)}</strong>
                  <small>{reference.sourceLocation.label}</small>
                  <CheckCircle2 aria-hidden="true" size={15} />
                </span>
              ))}
            </aside>
          </div>

          <div className="validation-success">
            <CheckCircle2 aria-hidden="true" size={16} />
            引用与来源映射已由本地解析器生成
            <span>
              <LockKeyhole aria-hidden="true" size={14} />
              发布后不可原地修改
            </span>
          </div>
          {error || lastError ? (
            <p className="form-error">{error ?? lastError?.message}</p>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="modal-success">
          <CheckCircle2 aria-hidden="true" size={30} />
          <h3>{result === 'published' ? `已发布 ${resultVersion}` : '草稿已保存'}</h3>
          <p>
            {result === 'published'
              ? '该版本已成为不可变知识快照，可立即用于一致性分析。'
              : '草稿已保存到本地工作区，可稍后继续完善并发布。'}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
