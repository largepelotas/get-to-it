import { useEffect } from 'react';
import { redoCommand, undoCommand } from '@/commands';
import { openDialog, useUI } from '@/store/ui';
import { isEditableTarget, matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';

export const UNDO_SHORTCUT = 'Mod+Z';
export const REDO_SHORTCUT = 'Mod+Shift+Z';
export const SETTINGS_SHORTCUT = 'Mod+,';

/**
 * App-wide shortcuts. Text fields keep their own undo, so shortcuts are
 * ignored while one has focus.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Settings opens from anywhere, as in other apps.
      if (matchesShortcut(event, SETTINGS_SHORTCUT, isMac)) {
        event.preventDefault();
        if (!useUI.getState().dialog) openDialog({ kind: 'settings' });
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (matchesShortcut(event, UNDO_SHORTCUT, isMac)) {
        event.preventDefault();
        undoCommand();
      } else if (
        matchesShortcut(event, REDO_SHORTCUT, isMac) ||
        (!isMac && matchesShortcut(event, 'Ctrl+Y', false))
      ) {
        event.preventDefault();
        redoCommand();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
