import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { AnalysisHome } from './features/analysis/AnalysisHome';
import { FindingsPage } from './features/findings/FindingsPage';
import { KnowledgePage } from './features/knowledge/KnowledgePage';
import { RepositoriesPage } from './features/repositories/RepositoriesPage';
import { SettingsModal } from './features/settings/SettingsModal';
import { TasksPage } from './features/tasks/TasksPage';
import type { NavigationId } from './types';

export function App() {
  const [activePage, setActivePage] = useState<NavigationId>('analysis');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [knowledgeImportOpen, setKnowledgeImportOpen] = useState(false);

  const openKnowledgeImport = () => {
    setActivePage('knowledge');
    setKnowledgeImportOpen(true);
  };

  return (
    <>
      <AppShell
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {activePage === 'analysis' ? (
          <AnalysisHome
            onNavigate={setActivePage}
            onOpenKnowledgeImport={openKnowledgeImport}
          />
        ) : null}
        {activePage === 'repositories' ? <RepositoriesPage /> : null}
        {activePage === 'knowledge' ? (
          <KnowledgePage
            importOpen={knowledgeImportOpen}
            onImportOpenChange={setKnowledgeImportOpen}
          />
        ) : null}
        {activePage === 'tasks' ? <TasksPage onNavigate={setActivePage} /> : null}
        {activePage === 'findings' ? <FindingsPage /> : null}
      </AppShell>

      <SettingsModal
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
      />
    </>
  );
}
