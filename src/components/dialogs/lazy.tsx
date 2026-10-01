import { lazy, type ComponentType } from 'react';

/**
 * A component loaded on first use. Once `preload` has finished it renders
 * straight away, without suspending.
 */
function lazyWithPreload<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  let loaded: ComponentType | null = null;
  const preload = () => load().then((m) => (loaded = pick(m)));
  const Lazy = lazy(() => preload().then((c) => ({ default: c })));
  function Component() {
    const Loaded = loaded;
    return Loaded ? <Loaded /> : <Lazy />;
  }
  return [Component, preload] as const;
}

// The palette (with cmdk and search), Settings and the shortcuts list stay out
// of the startup bundle. `preloadDialogs` fetches them once the app is idle,
// so opening one never waits.
const [CommandPalette, preloadPalette] = lazyWithPreload(
  () => import('@/components/palette/CommandPalette'),
  (m) => m.CommandPalette,
);
const [SettingsDialog, preloadSettings] = lazyWithPreload(
  () => import('./SettingsDialog'),
  (m) => m.SettingsDialog,
);
const [ShortcutsDialog, preloadShortcuts] = lazyWithPreload(
  () => import('./ShortcutsDialog'),
  (m) => m.ShortcutsDialog,
);

const [MoveTasksDialog, preloadMoveTasks] = lazyWithPreload(
  () => import('./MoveTasksDialog'),
  (m) => m.MoveTasksDialog,
);

export { CommandPalette, MoveTasksDialog, SettingsDialog, ShortcutsDialog };

export function preloadDialogs(): Promise<unknown> {
  return Promise.all([preloadPalette(), preloadSettings(), preloadShortcuts(), preloadMoveTasks()]);
}
