import { Dialogs } from './components/dialogs/Dialogs';
import { MainPane } from './components/MainPane';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toaster, TooltipProvider } from './components/ui';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useBackups } from './hooks/useBackups';
import { useReminderScheduler } from './hooks/useReminders';
import { useApplyTheme } from './hooks/useTheme';
import { useEffect } from 'react';
import { setSetting, useData } from './store/data';
import { useUI } from './store/ui';

export function App() {
  useApplyTheme();
  useAppShortcuts();
  useReminderScheduler();
  useAppLifecycle();
  useBackups();
  const sidebarHidden = useData((s) => s.settings.sidebarHidden);
  const renaming = useUI((s) => s.renaming);
  const creatingList = useUI((s) => s.dialog?.kind === 'newList');
  // New list and Rename act on the sidebar, so show it if it's hidden.
  useEffect(() => {
    if (sidebarHidden && (renaming || creatingList)) setSetting('sidebarHidden', false);
  }, [sidebarHidden, renaming, creatingList]);
  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-full">
        {!sidebarHidden && <Sidebar />}
        <MainPane />
      </div>
      <Dialogs />
      <Toaster />
    </TooltipProvider>
  );
}
