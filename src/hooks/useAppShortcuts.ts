import { useEffect } from 'react';
import { copyAsMarkdown, redoCommand, toggleSidebar, undoCommand } from '@/commands';
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

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]';

/**
 * Moves focus to the next (or previous) part of the window: the sidebar, the
 * open view and the details panel, marked with `data-region`. Focus lands on
 * the current thing there (the open list, the selected task), else the
 * quick-add field, else the first control.
 */
export function cycleRegion(step: 1 | -1): void {
  const regions = [...document.querySelectorAll<HTMLElement>('[data-region]')];
  if (!regions.length) return;
  const current = document.activeElement?.closest<HTMLElement>('[data-region]');
  const from = current ? regions.indexOf(current) : step === 1 ? -1 : 0;
  const region = regions[(from + step + regions.length) % regions.length];
  // Only what belongs to this region, not to one inside it (the details panel sits in the view).
  const own = (el: HTMLElement) =>
    el.closest('[data-region]') === region && el.tabIndex >= 0 && el.getClientRects().length > 0;
  const candidates = [...region.querySelectorAll<HTMLElement>(TABBABLE)].filter(own);
  const target =
    candidates.find((el) => el.hasAttribute('aria-current')) ??
    candidates.find((el) => el.hasAttribute('data-quick-add')) ??
    candidates[0] ??
    region;
  if (target === region && !region.hasAttribute('tabindex')) region.tabIndex = -1;
  target.focus();
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
      if (is(SHORTCUTS.nextRegion)) return run(() => cycleRegion(1));
      if (is(SHORTCUTS.previousRegion)) return run(() => cycleRegion(-1));
      if (is(SHORTCUTS.toggleSidebar)) return run(toggleSidebar);
      if (is(SHORTCUTS.settings)) return run(() => openDialog({ kind: 'settings' }));
      if (is(SHORTCUTS.help)) return run(() => openDialog({ kind: 'shortcuts' }));
      if (is(SHORTCUTS.newList)) return run(() => openDialog({ kind: 'newList', folderId: null }));
      if (is(SHORTCUTS.quickAddDialog)) return run(() => openDialog({ kind: 'quickAdd' }));
      if (is(SHORTCUTS.newTask)) {
        return run(() => {
          if (!focusQuickAdd()) openDialog({ kind: 'quickAdd' });
        });
      }
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
