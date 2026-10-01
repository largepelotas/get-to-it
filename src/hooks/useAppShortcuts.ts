import { useEffect } from 'react';
import { copyAsMarkdown, redoCommand, undoCommand } from '@/commands';
import { SHORTCUTS } from '@/lib/keymap';
import { isEditableTarget, matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';
import { closeDialog, navigate, openDialog, useUI, type View } from '@/store/ui';

/** Focuses the "Add a task" or "Add an item" field of the open view, if it has one. */
export function focusQuickAdd(): boolean {
  const field = document.querySelector<HTMLInputElement>('[data-quick-add]');
  field?.focus();
  return !!field;
}

const VIEWS: [string, View][] = [
  [SHORTCUTS.today, { kind: 'today' }],
  [SHORTCUTS.upcoming, { kind: 'upcoming' }],
  [SHORTCUTS.reminders, { kind: 'reminders' }],
];

/**
 * App-wide shortcuts. Navigation and dialogs work from anywhere, as in other
 * apps. Undo, redo and copying are ignored in text fields, which have their
 * own. While a dialog is open only the palette shortcut (to close it) works.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const is = (shortcut: string) => matchesShortcut(event, shortcut, isMac);
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      const { dialog, view } = useUI.getState();

      if (is(SHORTCUTS.palette) || is(SHORTCUTS.search)) {
        if (dialog?.kind === 'palette') return run(closeDialog);
        if (!dialog) return run(() => openDialog({ kind: 'palette' }));
        return;
      }
      if (dialog) return;
      if (is(SHORTCUTS.settings)) return run(() => openDialog({ kind: 'settings' }));
      if (is(SHORTCUTS.help)) return run(() => openDialog({ kind: 'shortcuts' }));
      if (is(SHORTCUTS.newList)) return run(() => openDialog({ kind: 'newList', folderId: null }));
      if (is(SHORTCUTS.newTask)) return run(() => void focusQuickAdd());
      for (const [shortcut, target] of VIEWS) {
        if (is(shortcut)) return run(() => navigate(target));
      }

      if (isEditableTarget(event.target)) return;
      if (is(SHORTCUTS.undo)) return run(undoCommand);
      if (is(SHORTCUTS.redo) || (!isMac && is('Ctrl+Y'))) return run(redoCommand);
      if (is(SHORTCUTS.copyMarkdown) && view.kind === 'list') {
        return run(() => void copyAsMarkdown(view.listId));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
