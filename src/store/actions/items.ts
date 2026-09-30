import type { Item, Priority, Recurrence } from '@/data/types';
import { newId } from '@/lib/id';
import { keyBetween } from '@/lib/order';
import { parseQuickAdd } from '@/lib/quickAdd';
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
): string | null {
  if (!raw.trim()) return null;
  if (!useData.getState().settings.parseDates) return createItem(listId, { text: raw, ...place });
  const { text, dueDate, dueTime, recurrence, priority } = parseQuickAdd(raw);
  return createItem(listId, { text, dueDate, dueTime, recurrence, priority, ...place });
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

export function setItemCollapsed(id: string, collapsed: boolean): void {
  commit('Collapse task', (tx) => void tx.update('items', id, { collapsed }), {
    undoable: false,
  });
}

/**
 * Checks or unchecks an item. Checking a parent also checks its open
 * subtasks; unchecking a subtask reopens its finished parents.
 */
export function setChecked(id: string, checked: boolean): void {
  commit(checked ? 'Complete task' : 'Reopen task', (tx) => {
    const item = tx.get('items', id);
    if (!item || item.checked === checked) return;
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
