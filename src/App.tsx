import { Dialogs } from './components/dialogs/Dialogs';
import { MainPane } from './components/MainPane';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toaster, TooltipProvider } from './components/ui';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useApplyTheme } from './hooks/useTheme';

export function App() {
  useApplyTheme();
  useAppShortcuts();
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
