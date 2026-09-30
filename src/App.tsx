import { Dialogs } from './components/dialogs/Dialogs';
import { MainPane } from './components/MainPane';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toaster, TooltipProvider } from './components/ui';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useBackups } from './hooks/useBackups';
import { useReminderScheduler } from './hooks/useReminders';
import { useApplyTheme } from './hooks/useTheme';

export function App() {
  useApplyTheme();
  useAppShortcuts();
  useReminderScheduler();
  useAppLifecycle();
  useBackups();
  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-full">
        <Sidebar />
        <MainPane />
      </div>
      <Dialogs />
      <Toaster />
    </TooltipProvider>
  );
}
