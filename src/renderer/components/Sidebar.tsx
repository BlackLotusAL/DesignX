import {
  BookOpen,
  FilePlus2,
  FolderGit2,
  FolderOpen,
  ListChecks,
  SearchCode,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { NavigationId } from '../types';
import { useAppData } from '../state/AppState';

interface SidebarProps {
  activePage: NavigationId;
  onNavigate: (page: NavigationId) => void;
  onOpenSettings: () => void;
}

const navigation: Array<{
  id: NavigationId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'analysis', label: '新建分析', icon: FilePlus2 },
  { id: 'repositories', label: '代码仓', icon: FolderGit2 },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'tasks', label: '分析任务', icon: ListChecks },
  { id: 'findings', label: '发现', icon: SearchCode },
];

export function Sidebar({ activePage, onNavigate, onOpenSettings }: SidebarProps) {
  const { snapshot } = useAppData();
  const { settings } = snapshot;

  return (
    <aside className="sidebar">
      <div className="sidebar__wordmark">DesignX</div>
      <nav aria-label="主导航" className="sidebar__nav">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className="sidebar__nav-item"
              data-active={active}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon aria-hidden={true} size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <button
          className="sidebar__workspace"
          onClick={onOpenSettings}
          title={settings.workspace}
          type="button"
        >
          <FolderOpen aria-hidden="true" size={18} />
          <span>{settings.workspace}</span>
        </button>
        <button
          aria-label="打开设置"
          className="sidebar__settings"
          onClick={onOpenSettings}
          type="button"
        >
          <Settings aria-hidden="true" size={19} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}
