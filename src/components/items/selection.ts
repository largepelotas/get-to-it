import type { KeyboardEvent } from 'react';
import { setTasksPriority, startFocus, toggleItems, trashItems } from '@/commands';
import type { Priority } from '@/data/types';
import { focusQuickAdd } from '@/hooks/useAppShortcuts';
import { matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';
import {
  clearMultiSelection,
  openDialog,
  pickDueDate,
  pickLabels,
  selectAll,
  selectRange,
  setSelectionDateOpen,
  setSelectionLabelsOpen,
  useUI,
} from '@/store/ui';
import type { RowKeyMode } from './ItemRow';

/** The priority keys: 1 to 3, and 4 for none. */
const DIGITS = ['1', '2', '3', '4'];

const ROW_SELECTOR = '[role="listitem"][data-item-id]';
const rowIds = () =>
  Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR), (el) => el.dataset.itemId!);

/**
 * Runs an action that may remove the focused task from the view (complete,
 * move, delete) and makes sure keyboard focus isn't lost to the page. If it
 * is, focus goes to the nearest row still shown (preferring one that is still
 * selected), else to the quick-add field.
 */
export function keepFocus(action: () => void): void {
  const before = rowIds();
  const focused = useUI.getState().selectedItemId;
  action();
  // Let the views re-render (and any popover or dialog finish closing) first.
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const now = new Set(rowIds());
    const at = focused ? before.indexOf(focused) : -1;
    const order =
      at < 0
        ? [...now]
        : [before[at], ...before.slice(at + 1), ...before.slice(0, at).reverse()].filter((id) =>
            now.has(id),
          );
    const selected = new Set(
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-multi-selected]'),
        (el) => el.dataset.itemId,
      ),
    );
    const target = order.find((id) => selected.has(id)) ?? order[0];
    const row = target
      ? document.querySelector<HTMLElement>(`${ROW_SELECTOR}[data-item-id="${target}"]`)
      : null;
    if (row) row.focus();
    else focusQuickAdd();
  }, 0);
}

export interface SelectionKeyContext {
  /** The focused row. */
  id: string;
  /** Every row in the view, in order. */
  ids: string[];
  readOnly: boolean;
  /** Moves focus to a row without changing what is selected. */
  focusRow: (id: string) => void;
  /** Completes the focused task alone, as Space does. */
  toggleOne: () => void;
  /** Shift+A: opens the new-task field at the top of the list (to-do lists only). */
  addAtTop?: () => void;
}

/**
 * Keys for selecting several tasks and for one-key actions on the focused task
 * or the whole selection. Returns true if the key was handled.
 */
export function handleSelectionKey(
  e: KeyboardEvent<HTMLElement>,
  mode: RowKeyMode,
  ctx: SelectionKeyContext,
): boolean {
  // Only on a focused row: never while typing in a field.
  if (mode !== 'row' || ctx.readOnly) return false;
  const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);
  const { multiSelectedIds, dialog } = useUI.getState();
  const several = multiSelectedIds.length >= 2 && multiSelectedIds.includes(ctx.id);
  const ids = several ? multiSelectedIds : [ctx.id];

  if (is('Escape') && several) {
    clearMultiSelection();
  } else if (is('Shift+ArrowUp') || is('Shift+ArrowDown')) {
    const next = ctx.ids[ctx.ids.indexOf(ctx.id) + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) {
      selectRange(next, ctx.ids);
      ctx.focusRow(next);
    }
  } else if (is('Mod+A')) {
    selectAll(ctx.ids);
  } else if (e.target !== e.currentTarget || dialog) {
    return false;
  } else if (is('e') || (several && (is(' ') || is('Mod+Enter')))) {
    if (several) keepFocus(() => toggleItems(ids));
    else ctx.toggleOne();
  } else if (is('t')) {
    if (several) setSelectionDateOpen(true);
    else pickDueDate(ctx.id);
  } else if (DIGITS.some((n) => is(n))) {
    // Which shortcut matched, not `e.key`: on AZERTY the digit keys print other characters.
    setTasksPriority(ids, (Number(DIGITS.find((n) => is(n))) % 4) as Priority);
  } else if (is('l')) {
    if (several) setSelectionLabelsOpen(true);
    else pickLabels(ctx.id);
  } else if (is('v')) {
    openDialog({ kind: 'moveTasks', ids });
  } else if (!several && is('f')) {
    startFocus(ctx.id, 'pomodoro');
  } else if (!several && is('Shift+F')) {
    startFocus(ctx.id, 'stopwatch');
  } else if (is('Shift+A') && ctx.addAtTop) {
    ctx.addAtTop();
  } else if (several && (is('Backspace') || is('Delete'))) {
    keepFocus(() => trashItems(ids));
  } else {
    return false;
  }
  e.preventDefault();
  return true;
}
