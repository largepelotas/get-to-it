import { useEffect } from 'react';
import { redoCommand, undoCommand } from '@/commands';
import { isEditableTarget, matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';

export const UNDO_SHORTCUT = 'Mod+Z';
export const REDO_SHORTCUT = 'Mod+Shift+Z';

/**
 * App-wide shortcuts. Text fields keep their own undo, so shortcuts are
 * ignored while one has focus.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
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
