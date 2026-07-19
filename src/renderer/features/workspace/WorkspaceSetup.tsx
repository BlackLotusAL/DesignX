import { FolderOpen, HardDrive, ShieldCheck } from 'lucide-react';
import type { AppError } from '../../../shared/types';
import { useAppActions } from '../../state/AppState';
import { Button } from '../../components/primitives/Button';
import { TitleBar } from '../../components/TitleBar';

export function WorkspaceSetup({
  error,
  loading,
}: {
  error: AppError | null;
  loading: boolean;
}) {
  const { selectWorkspace } = useAppActions();

  return (
    <div className="app-shell first-run">
      <TitleBar />
      <main className="first-run__content">
        <div className="first-run__panel">
          <span aria-hidden="true" className="first-run__icon">
            <HardDrive size={24} />
          </span>
          <h1>{loading ? '正在打开 DesignX…' : '选择本地工作区'}</h1>
          <p>
            代码、知识版本、分析任务与发现只会保存在你选择的目录中。
          </p>
          {!loading ? (
            <Button onClick={() => void selectWorkspace()} variant="primary">
              <FolderOpen aria-hidden="true" size={16} />
              选择目录
            </Button>
          ) : null}
          {error ? (
            <div className="first-run__error" role="alert">
              <strong>{error.message}</strong>
              {error.detail ? <small>{error.detail}</small> : null}
            </div>
          ) : null}
          <span className="first-run__note">
            <ShieldCheck aria-hidden="true" size={15} />
            工作区验证失败时不会改变当前目录，也不会创建半完成状态。
          </span>
        </div>
      </main>
    </div>
  );
}
