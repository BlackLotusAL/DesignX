import type { PropsWithChildren } from 'react';
import type { NavigationId } from '../types';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

interface AppShellProps {
  activePage: NavigationId;
  onNavigate: (page: NavigationId) => void;
  onOpenSettings: () => void;
}

export function AppShell({
  activePage,
  onNavigate,
  onOpenSettings,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-shell__body">
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
        />
        <main className={`workspace workspace--${activePage}`}>{children}</main>
      </div>
    </div>
  );
}
