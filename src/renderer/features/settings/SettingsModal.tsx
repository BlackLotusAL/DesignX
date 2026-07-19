import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useAppActions, useAppData } from '../../state/AppState';
import { Button } from '../../components/primitives/Button';
import { FormField, Input } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { snapshot, lastError } = useAppData();
  const { selectWorkspace, testModel, updateSettings } = useAppActions();
  const { settings } = snapshot;
  const [draft, setDraft] = useState({
    apiUrl: settings.apiUrl,
    model: settings.model,
    timeout: settings.timeout,
    credential: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({
      apiUrl: settings.apiUrl,
      model: settings.model,
      timeout: settings.timeout,
      credential: '',
    });
    setTesting(false);
    setSaving(false);
    setConnectionResult(null);
  }, [open, settings]);

  const update = <Key extends keyof typeof draft>(
    key: Key,
    value: (typeof draft)[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setConnectionResult(null);
  };

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const saved = await updateSettings({
                apiUrl: draft.apiUrl,
                model: draft.model,
                timeout: draft.timeout,
                ...(draft.credential ? { credential: draft.credential } : {}),
              });
              setSaving(false);
              if (saved) onClose();
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
                readOnly
                value={settings.workspace}
              />
              <Button
                onClick={() => {
                  if (
                    window.confirm(
                      '切换工作区会改变当前显示的数据。目标目录验证成功后才会生效，是否继续？',
                    )
                  ) {
                    void selectWorkspace();
                  }
                }}
                type="button"
              >
                选择目录
              </Button>
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
                  placeholder={
                    settings.credentialConfigured
                      ? '已安全保存；留空表示保留'
                      : '输入 Bearer API 凭据'
                  }
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
              onClick={async () => {
                setTesting(true);
                setConnectionResult(null);
                const result = await testModel({
                  apiUrl: draft.apiUrl,
                  model: draft.model,
                  timeout: draft.timeout,
                  ...(draft.credential ? { credential: draft.credential } : {}),
                });
                setTesting(false);
                if (result) {
                  setConnectionResult(
                    `连接成功 · ${result.model} · ${result.latencyMs}ms`,
                  );
                }
              }}
              type="button"
            >
              测试连接
            </Button>
            {connectionResult ? (
              <span>
                <CheckCircle2 aria-hidden="true" size={15} />
                {connectionResult}
              </span>
            ) : null}
          </div>
          {lastError ? <p className="form-error">{lastError.message}</p> : null}
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
