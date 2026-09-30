import type { Item, Priority, Recurrence } from '@/data/types';
import { isDateKey, isTimeString, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import { keyBetween } from '@/lib/order';
import { parseQuickAdd } from '@/lib/quickAdd';
import { firstOccurrence, nextDueDate, sanitizeRecurrence } from '@/lib/recurrence';
import { docFromText, docToPlainText, parseDoc } from '@/lib/richText';
import { commit, useData } from '../data';
import type { Tx } from '../history';
import { depthOf, descendantIds, MAX_DEPTH, subtreeHeight } from '../tree';
import { itemIndex, keyAt, listItems, siblings } from './helpers';

export interface NewItem {
  text: string;
  parentId?: string | null;
  /**
   * The sibling to insert after: an id, `null` for the first position, or
   * left out for the end.
   */
  after?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrence?: Recurrence | null;
}

/** A sort key for a new position among `parentId`'s children (see `NewItem.after`). */
function keyAfter(
  tx: Tx,
  listId: string,
  parentId: string | null,
  after: string | null | undefined,
  exceptId?: string,
): string {
  const sibs = siblings(tx, listId, parentId, exceptId);
  if (after === undefined) return keyAt(sibs, sibs.length);
  if (after === null) return keyAt(sibs, 0);
  const i = sibs.findIndex((s) => s.id === after);
  return keyAt(sibs, i < 0 ? sibs.length : i + 1);
}

/** An open item can't sit under a finished one, so reopen any finished ancestors. */
function reopenAncestors(tx: Tx, item: Item): void {
  let parent = tx.get('items', item.parentId);
  for (let guard = 0; parent && guard < 50; guard++) {
    if (parent.checked) tx.update('items', parent.id, { checked: false, completedAt: null });
    parent = tx.get('items', parent.parentId);
  }
}

/** Adds an item inside an existing transaction and returns its id. */
export function insertItem(tx: Tx, listId: string, input: NewItem): string {
  const parentId = input.parentId ?? null;
  const item: Item = {
    id: newId(),
    listId,
    parentId,
    text: input.text.trim(),
    checked: false,
    completedAt: null,
    sortKey: keyAfter(tx, listId, parentId, input.after),
    collapsed: false,
    details: null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueDate ? (input.dueTime ?? null) : null,
    priority: input.priority ?? 0,
    recurrence: input.recurrence ?? null,
    quantity: null,
    category: null,
    createdAt: tx.now,
    updatedAt: tx.now,
    deletedAt: null,
  };
  tx.put('items', item);
  if (parentId) {
    if (tx.get('items', parentId)?.collapsed) tx.update('items', parentId, { collapsed: false });
    reopenAncestors(tx, item);
  }
  return item.id;
}

export function createItem(listId: string, input: NewItem): string | null {
  if (!input.text.trim()) return null;
  return commit('New task', (tx) => insertItem(tx, listId, input));
}

/**
 * Adds a task from typed text. Dates, repeats and priority are read out of
 * the text when the "parse dates" setting is on.
 */
export function createItemFromText(
  listId: string,
  raw: string,
  place: Pick<NewItem, 'parentId' | 'after'> = {},
  /** The due date to use when the text doesn't give one (e.g. today, in the Today view). */
  defaultDue: string | null = null,
): string | null {
  if (!raw.trim()) return null;
  if (!useData.getState().settings.parseDates) {
    return createItem(listId, { text: raw, dueDate: defaultDue, ...place });
  }
  const { text, dueDate, dueTime, recurrence, priority } = parseQuickAdd(raw);
  return createItem(listId, {
    text,
    dueDate: dueDate ?? defaultDue,
    dueTime,
    recurrence,
    priority,
    ...place,
  });
}

export function setItemText(id: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  commit('Edit task', (tx) => void tx.update('items', id, { text: trimmed }), {
    coalesce: `item-text:${id}`,
  });
}

/** Stores plain-text notes as a rich-text doc (the rich editor comes in M6). */
export function setItemNotes(id: string, notes: string): void {
  const details = notes.trim() ? JSON.stringify(docFromText(notes)) : null;
  commit('Edit notes', (tx) => void tx.update('items', id, { details }), {
    coalesce: `item-notes:${id}`,
  });
}

export function itemNotesText(item: Item): string {
  return docToPlainText(parseDoc(item.details));
}

export function setPriority(id: string, priority: Priority): void {
  commit('Priority', (tx) => void tx.update('items', id, { priority }));
}

export function clearDue(id: string): void {
  commit(
    'Clear due date',
    (tx) => void tx.update('items', id, { dueDate: null, dueTime: null, recurrence: null }),
  );
}

/**
 * Sets the due date and time. A time needs a date; clearing the date also
 * clears the time and the repeat, since a repeat counts from the due date.
 */
export function setDue(id: string, dueDate: string | null, dueTime: string | null = null): void {
  if (!dueDate || !isDateKey(dueDate)) return clearDue(id);
  commit(
    'Due date',
    (tx) =>
      void tx.update('items', id, {
        dueDate,
        dueTime: isTimeString(dueTime) ? dueTime : null,
      }),
  );
}

/** Moves tasks to a new day, keeping their times (Today's "Reschedule" for overdue tasks). */
export function moveDueDates(ids: string[], dueDate: string): void {
  if (!isDateKey(dueDate)) return;
  commit(ids.length === 1 ? 'Due date' : 'Reschedule tasks', (tx) => {
    for (const id of ids) {
      if (tx.get('items', id)?.dueDate) tx.update('items', id, { dueDate });
    }
  });
}

/** Sets only the time, keeping the date (today if there isn't one). */
export function setDueTime(id: string, dueTime: string | null): void {
  commit(
    'Due time',
    (tx) => {
      const item = tx.get('items', id);
      if (!item) return;
      const time = isTimeString(dueTime) ? dueTime : null;
      if (!item.dueDate && !time) return;
      tx.update('items', id, {
        dueDate: item.dueDate ?? todayKey(new Date(tx.now)),
        dueTime: time,
      });
    },
    // Typing in a time field sends a change per keystroke.
    { coalesce: `item-time:${id}` },
  );
}

/**
 * Sets or clears the repeat rule. A repeating task needs a due date, so one
 * is added if missing, and a weekly rule moves the date onto one of its days.
 */
export function setRecurrence(id: string, rule: Recurrence | null): void {
  const clean = rule ? sanitizeRecurrence(rule) : null;
  commit(clean ? 'Repeat' : 'Stop repeating', (tx) => {
    const item = tx.get('items', id);
    if (!item) return;
    if (!clean) return void tx.update('items', id, { recurrence: null });
    const from = item.dueDate ?? todayKey(new Date(tx.now));
    tx.update('items', id, { recurrence: clean, dueDate: firstOccurrence(clean, from) });
  });
}

/** Whether checking the item moves it to its next date instead of finishing it. */
export const repeatsOnCheck = (item: Item) => !!item.recurrence && !item.checked;

/**
 * Finishes one occurrence of a repeating task: records it, moves the due
 * date to the next occurrence and reopens the subtasks. Returns the new date.
 */
function completeOccurrence(tx: Tx, item: Item): string {
  const today = todayKey(new Date(tx.now));
  const next = nextDueDate(item.recurrence!, item.dueDate, today);
  tx.put('completions', {
    id: newId(),
    itemId: item.id,
    dueDate: item.dueDate,
    completedAt: tx.now,
  });
  tx.update('items', item.id, { dueDate: next });
  for (const childId of descendantIds(itemIndex(tx, item.listId), item.id)) {
    if (tx.get('items', childId)?.checked) {
      tx.update('items', childId, { checked: false, completedAt: null });
    }
  }
  return next;
}

export function setItemCollapsed(id: string, collapsed: boolean): void {
  commit('Collapse task', (tx) => void tx.update('items', id, { collapsed }), {
    undoable: false,
  });
}

/**
 * Checks or unchecks an item. Checking a parent also checks its open
 * subtasks; unchecking a subtask reopens its finished parents. Checking a
 * repeating task moves it to its next date instead, and returns that date.
 */
export function setChecked(id: string, checked: boolean): string | null {
  return commit(checked ? 'Complete task' : 'Reopen task', (tx) => {
    const item = tx.get('items', id);
    if (!item || item.checked === checked) return null;
    if (checked && item.recurrence) return completeOccurrence(tx, item);
    if (checked) {
      tx.update('items', id, { checked: true, completedAt: tx.now });
      for (const childId of descendantIds(itemIndex(tx, item.listId), id)) {
        if (!tx.get('items', childId)?.checked) {
          tx.update('items', childId, { checked: true, completedAt: tx.now });
        }
      }
    } else {
      tx.update('items', id, { checked: false, completedAt: null });
      reopenAncestors(tx, item);
    }
    return null;
  });
}

/** Moves items and their subtasks to the Trash. */
export function deleteItems(ids: string[]): void {
  commit(ids.length === 1 ? 'Delete task' : 'Delete tasks', (tx) => {
    for (const id of ids) {
      const item = tx.get('items', id);
      if (!item || item.deletedAt) continue;
      for (const childId of descendantIds(itemIndex(tx, item.listId), id)) {
        tx.update('items', childId, { deletedAt: tx.now });
      }
      tx.update('items', id, { deletedAt: tx.now });
    }
  });
}

/**
 * The siblings shown next to an item, in order. Finished top-level tasks sit
 * in a separate Completed section, so at the top level only items in the
 * same state count.
 */
export function shownSiblings(tx: Tx, item: Item): Item[] {
  const sibs = siblings(tx, item.listId, item.parentId);
  return item.parentId ? sibs : sibs.filter((s) => s.checked === item.checked);
}

/** Whether `id` (with its subtasks) fits `levels` deeper than it is now. */
function fitsDeeper(tx: Tx, item: Item, levels: number): boolean {
  const byId = new Map(listItems(tx, item.listId).map((i) => [i.id, i]));
  const height = subtreeHeight(itemIndex(tx, item.listId), item.id);
  return depthOf(byId, item) + levels + height <= MAX_DEPTH;
}

/** Makes an item the last subtask of the item above it. Returns false if it can't. */
export function indentItem(id: string): boolean {
  return commit('Indent task', (tx) => {
    const item = tx.get('items', id);
    // Finished top-level tasks are listed by completion time, so there's no "item above".
    if (!item || item.deletedAt || (item.checked && !item.parentId)) return false;
    const sibs = shownSiblings(tx, item);
    const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
    if (!prev || !fitsDeeper(tx, item, 1)) return false;
    const moved = tx.update('items', id, {
      parentId: prev.id,
      sortKey: keyAfter(tx, item.listId, prev.id, undefined, id),
    })!;
    if (prev.collapsed) tx.update('items', prev.id, { collapsed: false });
    if (!moved.checked) reopenAncestors(tx, moved);
    return true;
  });
}

/** Moves a subtask out to sit right after its parent. Returns false if it can't. */
export function outdentItem(id: string): boolean {
  return commit('Outdent task', (tx) => {
    const item = tx.get('items', id);
    const parent = tx.get('items', item?.parentId);
    if (!item || !parent) return false;
    tx.update('items', id, {
      parentId: parent.parentId,
      sortKey: keyAfter(tx, item.listId, parent.parentId, parent.id, id),
    });
    return true;
  });
}

/** Swaps an item with the sibling above (-1) or below (1). Returns false at either end. */
export function moveItemBy(id: string, direction: -1 | 1): boolean {
  return commit('Move task', (tx) => {
    const item = tx.get('items', id);
    if (!item || (item.checked && !item.parentId)) return false;
    const sibs = shownSiblings(tx, item);
    const i = sibs.findIndex((s) => s.id === id);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= sibs.length) return false;
    const [before, after] =
      direction < 0 ? [sibs[target - 1], sibs[target]] : [sibs[target], sibs[target + 1]];
    tx.update('items', id, {
      sortKey: keyBetween(before?.sortKey ?? null, after?.sortKey ?? null),
    });
    return true;
  });
}

/** Moves an item (with its subtasks) under `parentId`, after the sibling `after` (null = first). */
export function moveItem(id: string, parentId: string | null, after: string | null): void {
  commit('Move task', (tx) => {
    const item = tx.get('items', id);
    if (!item || id === parentId) return;
    if (parentId && descendantIds(itemIndex(tx, item.listId), id).includes(parentId)) return;
    const moved = tx.update('items', id, {
      parentId,
      sortKey: keyAfter(tx, item.listId, parentId, after, id),
    })!;
    if (parentId && tx.get('items', parentId)?.collapsed) {
      tx.update('items', parentId, { collapsed: false });
    }
    if (!moved.checked) reopenAncestors(tx, moved);
  });
}
