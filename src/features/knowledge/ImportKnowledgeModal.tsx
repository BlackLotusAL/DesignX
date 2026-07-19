import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  File,
  FileText,
  FolderUp,
  LockKeyhole,
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import type { KnowledgeType } from '../../types';
import { Button } from '../../components/primitives/Button';
import { FormField, Input, Select } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface ImportKnowledgeModalProps {
  open: boolean;
  onClose: () => void;
}

type ImportStep = 1 | 2 | 3;

const supportedExtensions = ['.md', '.pdf', '.docx'];

export function ImportKnowledgeModal({
  open,
  onClose,
}: ImportKnowledgeModalProps) {
  const { knowledgePackages, addKnowledgePackage } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>(1);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [name, setName] = useState('支付域系统设计');
  const [type, setType] = useState<KnowledgeType>('系统设计');
  const [scope, setScope] = useState('services/payment/**');
  const [activeTab, setActiveTab] = useState<'skill' | 'references'>('skill');
  const [result, setResult] = useState<'published' | 'draft'>('published');
  const [resultVersion, setResultVersion] = useState('v1.0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSourceFiles([]);
    setName('支付域系统设计');
    setType('系统设计');
    setScope('services/payment/**');
    setActiveTab('skill');
    setResultVersion('v1.0');
    setError(null);
  }, [open]);

  const versionPreview = useMemo(() => {
    const existing = knowledgePackages.find((item) => item.name === name);
    if (!existing || !/^v\d+\.\d+$/.test(existing.version)) return 'v1.0';
    const [major, minor] = existing.version.slice(1).split('.').map(Number);
    return `v${major}.${minor + 1}`;
  }, [knowledgePackages, name]);

  const chooseFiles = (files: FileList | null) => {
    if (!files) return;
    const names = Array.from(files).map((file) => file.name);
    const unsupported = names.find(
      (fileName) =>
        !supportedExtensions.some((extension) =>
          fileName.toLowerCase().endsWith(extension),
        ),
    );
    if (unsupported) {
      setError(`暂不支持 ${unsupported}，请选择 Markdown、PDF 或 DOCX。`);
      return;
    }
    setSourceFiles(names);
    setError(null);
  };

  const goToDraft = () => {
    if (sourceFiles.length === 0) {
      setError('请至少选择一个规范文档。');
      return;
    }
    setError(null);
    setStep(2);
  };

  const save = (publish: boolean) => {
    if (!name.trim() || !scope.trim()) {
      setError('请填写知识包名称和适用范围。');
      return;
    }
    addKnowledgePackage({
      name,
      type,
      scope,
      sourceFiles,
      publish,
    });
    setResultVersion(versionPreview);
    setResult(publish ? 'published' : 'draft');
    setStep(3);
  };

  const footer =
    step === 1 ? (
      <>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={goToDraft} variant="primary">
          生成草稿
        </Button>
      </>
    ) : step === 2 ? (
      <>
        <Button onClick={() => setStep(1)}>返回</Button>
        <div className="modal__footer-spacer" />
        <Button onClick={() => save(false)}>保存草稿</Button>
        <Button onClick={() => save(true)} variant="primary">
          发布 {versionPreview}
        </Button>
      </>
    ) : (
      <Button onClick={onClose} variant="primary">
        完成
      </Button>
    );

  return (
    <Modal
      footer={footer}
      onClose={onClose}
      open={open}
      size="large"
      title="导入规范文档"
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
          <input
            accept=".md,.pdf,.docx"
            hidden
            multiple
            onChange={(event) => chooseFiles(event.target.files)}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="file-dropzone"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FolderUp aria-hidden="true" size={25} />
            <strong>选择本地文档</strong>
            <span>支持 Markdown、PDF 与 DOCX，可一次导入多个文件</span>
          </button>
          <div className="import-files__or">或</div>
          <Button
            onClick={() => {
              setSourceFiles(['payment-design.md', 'idempotency.pdf']);
              setError(null);
            }}
          >
            加载示例文档
          </Button>
          {sourceFiles.length > 0 ? (
            <div className="selected-files">
              {sourceFiles.map((fileName) => (
                <span key={fileName}>
                  <FileText aria-hidden="true" size={15} />
                  {fileName}
                  <CheckCircle2 aria-hidden="true" size={14} />
                </span>
              ))}
            </div>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="knowledge-draft">
          <div className="source-summary">
            <span>来源文件：</span>
            {sourceFiles.map((fileName) => (
              <span key={fileName}>
                <File aria-hidden="true" size={14} />
                {fileName}
              </span>
            ))}
            <small>支持 .md · .pdf · .docx</small>
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
              <div className="readonly-field">将发布为 {versionPreview}</div>
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
              references ({sourceFiles.length})
            </button>
          </div>

          <div className="draft-editor">
            {activeTab === 'skill' ? (
              <pre>{`# 支付域系统设计

## 1. 目标
提供统一、可靠、安全的支付能力，
支持多渠道接入，保障幂等与可追溯。

## 2. 架构概览
采用领域驱动设计分层，核心模块包括：
订单、支付、渠道适配、结算与对账。`}</pre>
            ) : (
              <div className="reference-preview">
                {sourceFiles.map((fileName, index) => (
                  <span key={fileName}>
                    <FileText aria-hidden="true" size={15} />
                    <strong>{fileName}</strong>
                    <small>{index === 0 ? '第 1–120 行 · 设计内容' : '第 1–28 页 · 幂等设计'}</small>
                    <CheckCircle2 aria-hidden="true" size={15} />
                  </span>
                ))}
              </div>
            )}
            <aside className="source-mapping">
              <h4>来源映射</h4>
              {sourceFiles.map((fileName, index) => (
                <span key={fileName}>
                  <FileText aria-hidden="true" size={15} />
                  <strong>{fileName}</strong>
                  <small>{index === 0 ? '第 1–120 行' : '第 1–28 页'}</small>
                  <CheckCircle2 aria-hidden="true" size={15} />
                </span>
              ))}
            </aside>
          </div>

          <div className="validation-success">
            <CheckCircle2 aria-hidden="true" size={16} />
            引用与来源映射校验通过
            <span>
              <LockKeyhole aria-hidden="true" size={14} />
              发布后不可原地修改
            </span>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
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
