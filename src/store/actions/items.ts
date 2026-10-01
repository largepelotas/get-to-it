import type { Item, Priority, Recurrence } from '@/data/types';
import { isDateKey, isTimeString, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import { keyBetween } from '@/lib/order';
import { parseQuickAdd } from '@/lib/quickAdd';
import { firstOccurrence, nextDueDate, sanitizeRecurrence, skipDueDate } from '@/lib/recurrence';
import { docFromText, docToPlainText, isDocEmpty, parseDoc, type RichNode } from '@/lib/richText';
import { commit, useData } from '../data';
import type { Tx } from '../history';
import { depthOf, descendantIds, MAX_DEPTH, subtreeHeight } from '../tree';
import { itemIndex, keyAt, listItems, siblings } from './helpers';
import { clearSnoozes } from './reminders';

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
  /** Grocery items. */
  quantity?: string | null;
  category?: string | null;
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
    if (parent.checked) {
      tx.update('items', parent.id, { checked: false, wontDo: false, completedAt: null });
    }
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
    wontDo: false,
    completedAt: null,
    sortKey: keyAfter(tx, listId, parentId, input.after),
    collapsed: false,
    details: null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueDate ? (input.dueTime ?? null) : null,
    priority: input.priority ?? 0,
    recurrence: input.recurrence ?? null,
    quantity: input.quantity ?? null,
    category: input.category ?? null,
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
/** Saves a task's notes. Text or a rich-text doc; an empty one clears them. */
export function setItemNotes(id: string, notes: string | RichNode | null): void {
  const doc = typeof notes === 'string' ? docFromText(notes) : notes;
  const details = doc && !isDocEmpty(doc) ? JSON.stringify(doc) : null;
  if (useData.getState().tables.items[id]?.details === details) return;
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
  commit('Clear due date', (tx) => {
    tx.update('items', id, { dueDate: null, dueTime: null, recurrence: null });
    clearSnoozes(tx, id);
  });
}

/**
 * Sets the due date and time. A time needs a date; clearing the date also
 * clears the time and the repeat, since a repeat counts from the due date.
 */
export function setDue(id: string, dueDate: string | null, dueTime: string | null = null): void {
  if (!dueDate || !isDateKey(dueDate)) return clearDue(id);
  commit('Due date', (tx) => {
    tx.update('items', id, { dueDate, dueTime: isTimeString(dueTime) ? dueTime : null });
    clearSnoozes(tx, id);
  });
}

/** Moves tasks to a new day, keeping their times (Today's "Reschedule" for overdue tasks). */
export function moveDueDates(ids: string[], dueDate: string): void {
  if (!isDateKey(dueDate)) return;
  commit(ids.length === 1 ? 'Due date' : 'Reschedule tasks', (tx) => {
    for (const id of ids) {
      if (!tx.get('items', id)?.dueDate) continue;
      tx.update('items', id, { dueDate });
      clearSnoozes(tx, id);
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
      clearSnoozes(tx, id);
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
    clearSnoozes(tx, id);
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
  clearSnoozes(tx, item.id);
  for (const childId of descendantIds(itemIndex(tx, item.listId), item.id)) {
    if (tx.get('items', childId)?.checked) {
      tx.update('items', childId, { checked: false, wontDo: false, completedAt: null });
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
      tx.update('items', id, { checked: true, wontDo: false, completedAt: tx.now });
      for (const childId of descendantIds(itemIndex(tx, item.listId), id)) {
        if (!tx.get('items', childId)?.checked) {
          tx.update('items', childId, { checked: true, wontDo: false, completedAt: tx.now });
        }
      }
    } else {
      tx.update('items', id, { checked: false, wontDo: false, completedAt: null });
      reopenAncestors(tx, item);
    }
    return null;
  });
}

/**
 * Skips one occurrence of an open repeating task: the due date moves to the
 * next one after the current date (and not before today, if it's overdue). Nothing is recorded as done. Returns the
 * new date, or null if the task doesn't repeat.
 */
export function skipOccurrence(id: string): string | null {
  return commit('Skip occurrence', (tx) => {
    const item = tx.get('items', id);
    if (!item || item.deletedAt || item.checked || !item.recurrence || !item.dueDate) return null;
    const next = skipDueDate(item.recurrence, item.dueDate, todayKey(new Date(tx.now)));
    tx.update('items', id, { dueDate: next });
    clearSnoozes(tx, id);
    return next;
  });
}

/**
 * Closes an open, non-repeating task (and its open subtasks) without doing
 * it. It sits in the Completed section like a finished task.
 */
export function setWontDo(id: string): void {
  commit("Won't do", (tx) => {
    const item = tx.get('items', id);
    if (!item || item.deletedAt || item.checked || item.recurrence) return;
    tx.update('items', id, { checked: true, wontDo: true, completedAt: tx.now });
    for (const childId of descendantIds(itemIndex(tx, item.listId), id)) {
      if (!tx.get('items', childId)?.checked) {
        tx.update('items', childId, { checked: true, wontDo: true, completedAt: tx.now });
      }
    }
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

/**
 * Moves a task and its subtasks to another to-do list. The task becomes a
 * top-level task at the end of that list; its subtasks stay under it.
 */
export function moveItemToList(id: string, listId: string): void {
  commit('Move task', (tx) => {
    const item = tx.get('items', id);
    const target = tx.get('lists', listId);
    if (!item || item.deletedAt || item.listId === listId) return;
    if (!target || target.type !== 'todo' || target.archivedAt || target.deletedAt) return;
    const subtasks = descendantIds(itemIndex(tx, item.listId), id);
    tx.update('items', id, {
      listId,
      parentId: null,
      sortKey: keyAfter(tx, listId, null, undefined),
    });
    for (const childId of subtasks) tx.update('items', childId, { listId });
  });
}

/**
 * Copies a task and its subtasks into the same list, right after the
 * original. Every copy is open. Reminders and completions aren't copied, so
 * the copy doesn't notify twice. Returns the new task's id.
 */
export function duplicateItem(id: string): string | null {
  return commit('Duplicate task', (tx) => {
    const item = tx.get('items', id);
    if (!item || item.deletedAt) return null;
    const subtasks = descendantIds(itemIndex(tx, item.listId), id);
    const ids = new Map([id, ...subtasks].map((oldId) => [oldId, newId()]));
    for (const oldId of [id, ...subtasks]) {
      const source = tx.get('items', oldId);
      if (!source) continue;
      const isTop = oldId === id;
      tx.put('items', {
        ...source,
        id: ids.get(oldId)!,
        parentId: isTop ? item.parentId : (ids.get(source.parentId ?? '') ?? null),
        sortKey: isTop ? keyAfter(tx, item.listId, item.parentId, id) : source.sortKey,
        checked: false,
        wontDo: false,
        completedAt: null,
        createdAt: tx.now,
        updatedAt: tx.now,
      });
    }
    const copy = tx.get('items', ids.get(id))!;
    reopenAncestors(tx, copy);
    return copy.id;
  });
}
