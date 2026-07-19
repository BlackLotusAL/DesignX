import { useEffect, useState, type FormEvent } from 'react';
import { GitBranch, ShieldCheck } from 'lucide-react';
import { useAppState } from '../../state/AppState';
import { Button } from '../../components/primitives/Button';
import { FormField, Input } from '../../components/primitives/FormField';
import { Modal } from '../../components/primitives/Modal';

interface AddRepositoryModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddRepositoryModal({ open, onClose }: AddRepositoryModalProps) {
  const { repositories, addRepository } = useAppState();
  const [name, setName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setRemoteUrl('');
    setBranch('main');
    setError(null);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !remoteUrl.trim()) {
      setError('请填写代码仓名称和 Git 地址。');
      return;
    }
    if (
      !/^(ssh:\/\/|https:\/\/|git@)/.test(remoteUrl.trim())
    ) {
      setError('Git 地址应以 ssh://、https:// 或 git@ 开头。');
      return;
    }
    if (
      repositories.some(
        (repository) =>
          repository.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      setError('工作区中已存在同名代码仓，请使用其他名称。');
      return;
    }

    addRepository({ name, remoteUrl, branch });
    onClose();
  };

  return (
    <Modal
      description="添加前会检查地址格式、默认分支与本地目录冲突。"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button form="add-repository-form" type="submit" variant="primary">
            验证并添加
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="添加代码仓"
    >
      <form id="add-repository-form" onSubmit={submit}>
        <div className="form-grid">
          <FormField htmlFor="repository-name" label="代码仓名称">
            <Input
              autoFocus
              id="repository-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 payment-service"
              value={name}
            />
          </FormField>
          <FormField htmlFor="repository-branch" label="默认分支">
            <Input
              id="repository-branch"
              onChange={(event) => setBranch(event.target.value)}
              value={branch}
            />
          </FormField>
          <FormField htmlFor="repository-url" label="企业 Git 地址">
            <Input
              id="repository-url"
              onChange={(event) => setRemoteUrl(event.target.value)}
              placeholder="ssh://git.internal.example/team/repository.git"
              value={remoteUrl}
            />
          </FormField>
        </div>
        <div className="repository-checks">
          <span>
            <ShieldCheck aria-hidden="true" size={16} />
            凭据由 Windows Credential Manager 管理
          </span>
          <span>
            <GitBranch aria-hidden="true" size={16} />
            MVP 仅分析默认分支
          </span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </Modal>
  );
}
