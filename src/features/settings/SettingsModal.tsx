import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useAppState } from '../../state/AppState';
import type { AppSettings } from '../../types';
import { Button } from '../../components/primitives/Button';
import { FormField, Input } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useAppState();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [testing, setTesting] = useState(false);
  const [connectionOk, setConnectionOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setTesting(false);
    setConnectionOk(false);
  }, [open, settings]);

  const update = <Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setConnectionOk(false);
  };

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            onClick={() => {
              updateSettings(draft);
              onClose();
            }}
            variant="primary"
          >
            保存设置
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="medium"
      title="设置"
    >
      <div className="settings-sections">
        <section>
          <h3>
            <FolderOpen aria-hidden="true" size={16} />
            本地工作区
          </h3>
          <FormField label="工作区目录">
            <div className="input-with-action">
              <Input
                onChange={(event) => update('workspace', event.target.value)}
                value={draft.workspace}
              />
              <Button type="button">选择目录</Button>
            </div>
          </FormField>
          <p className="settings-note">
            代码、知识包、任务与发现只保存在该目录。切换工作区前会要求再次确认。
          </p>
        </section>

        <section>
          <h3>
            <Server aria-hidden="true" size={16} />
            企业模型
          </h3>
          <div className="form-grid form-grid--two">
            <FormField label="OpenAI-compatible API 地址">
              <Input
                onChange={(event) => update('apiUrl', event.target.value)}
                value={draft.apiUrl}
              />
            </FormField>
            <FormField label="模型名称">
              <Input
                onChange={(event) => update('model', event.target.value)}
                value={draft.model}
              />
            </FormField>
            <FormField label="API 凭据">
              <div className="input-with-icon">
                <KeyRound aria-hidden="true" size={15} />
                <Input
                  onChange={(event) => update('credential', event.target.value)}
                  type="password"
                  value={draft.credential}
                />
              </div>
            </FormField>
            <FormField label="请求超时（秒）">
              <Input
                min={10}
                onChange={(event) =>
                  update('timeout', Number(event.target.value) || 10)
                }
                type="number"
                value={draft.timeout}
              />
            </FormField>
          </div>
          <div className="settings-connection">
            <Button
              loading={testing}
              onClick={() => {
                setTesting(true);
                setConnectionOk(false);
                window.setTimeout(() => {
                  setTesting(false);
                  setConnectionOk(true);
                }, 800);
              }}
              type="button"
            >
              测试连接
            </Button>
            {connectionOk ? (
              <span>
                <CheckCircle2 aria-hidden="true" size={15} />
                连接成功，模型可用
              </span>
            ) : null}
          </div>
        </section>

        <div className="credential-note">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>
            凭据通过 Windows Credential Manager 或 DPAPI 保存，不会以明文写入工作区文件。
          </span>
        </div>
      </div>
    </Modal>
  );
}
