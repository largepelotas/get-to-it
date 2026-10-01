import type { Item, Priority, Recurrence } from '@/data/types';
import { isDateKey, isTimeString, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import { keyBetween } from '@/lib/order';
import { parseQuickAdd } from '@/lib/quickAdd';
import type { ReminderSpec } from '@/lib/reminders';
import { firstOccurrence, nextDueDate, sanitizeRecurrence, skipDueDate } from '@/lib/recurrence';
import { docFromText, docToPlainText, isDocEmpty, parseDoc, type RichNode } from '@/lib/richText';
import { commit, useData } from '../data';
import type { Tx } from '../history';
import { depthOf, descendantIds, MAX_DEPTH, subtreeHeight } from '../tree';
import { itemIndex, keyAt, listItems, listSections, sectionOf, siblings } from './helpers';
import { liveTodoLists } from '../sidebar';
import { ensureLabel } from './labels';
import { clearSnoozes, insertReminder } from './reminders';

export interface NewItem {
  text: string;
  parentId?: string | null;
  /**
   * The sibling to insert after: an id, `null` for the first position, or
   * left out for the end.
   */
  after?: string | null;
  /**
   * The section for a new top-level task. Left out, a task added after another
   * task goes into that task's section, and any other goes into none. Ignored
   * for a subtask, and when it isn't a section of this list.
   */
  sectionId?: string | null;
  priority?: Priority;
  /** Labels to put on a to-do task. Unknown ids and repeats are dropped; ignored on other lists. */
  labelIds?: string[];
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
  let sectionId: string | null = null;
  if (!parentId) {
    const afterItem = input.after ? tx.get('items', input.after) : undefined;
    const wanted =
      input.sectionId !== undefined ? input.sectionId : afterItem ? sectionOf(tx, afterItem) : null;
    if (wanted && tx.get('sections', wanted)?.listId === listId) sectionId = wanted;
  }
  const labelIds =
    tx.get('lists', listId)?.type === 'todo'
      ? [...new Set(input.labelIds ?? [])].filter((l) => tx.get('labels', l))
      : [];
  const item: Item = {
    id: newId(),
    listId,
    parentId,
    sectionId,
    labelIds,
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

/** What typed text turns into: where it goes, the task's fields and an optional reminder. */
interface Prepared {
  listId: string;
  input: NewItem;
  /** Names of labels to create (or find) when the task is added. */
  newLabels: string[];
  reminder: ReminderSpec | null;
}

function prepareFromText(
  listId: string,
  raw: string,
  place: Pick<NewItem, 'parentId' | 'after' | 'sectionId'>,
  defaultDue: string | null,
  extraLabelIds: string[] = [],
): Prepared | null {
  if (!raw.trim()) return null;
  const { settings, tables } = useData.getState();
  if (!settings.parseDates) {
    return {
      listId,
      input: { text: raw, dueDate: defaultDue, labelIds: extraLabelIds, ...place },
      newLabels: [],
      reminder: null,
    };
  }
  // `#List` only applies to a plain add; a subtask or an insert at a spot stays where it is.
  const plain = !place.parentId && place.after === undefined;
  const parsed = parseQuickAdd(raw, new Date(), {
    lists: plain ? liveTodoLists(tables) : [],
    sections: plain ? Object.values(tables.sections) : [],
    labels: tables.lists[listId]?.type === 'todo' ? Object.values(tables.labels) : undefined,
    listId,
    defaultDue,
  });
  const dueDate = parsed.dueDate ?? defaultDue;
  // A relative reminder counts from the due date, so it needs one.
  const reminder = parsed.reminder?.kind === 'relative' && !dueDate ? null : parsed.reminder;
  return {
    listId: parsed.listId ?? listId,
    input: {
      text: parsed.text,
      dueDate,
      dueTime: parsed.dueTime,
      recurrence: parsed.recurrence,
      priority: parsed.priority,
      labelIds: [...new Set([...extraLabelIds, ...parsed.labelIds])],
      ...place,
      ...(parsed.sectionId ? { sectionId: parsed.sectionId } : {}),
    },
    newLabels: parsed.newLabels,
    reminder,
  };
}

function insertPrepared(tx: Tx, p: Prepared): string {
  // New labels are made in this same step; one named on several lines is made once.
  const made = p.newLabels.flatMap((name) => ensureLabel(tx, name) ?? []);
  const input = made.length
    ? { ...p.input, labelIds: [...(p.input.labelIds ?? []), ...made] }
    : p.input;
  const id = insertItem(tx, p.listId, input);
  if (p.reminder) insertReminder(tx, id, p.reminder);
  return id;
}

/**
 * Adds a task from typed text. Dates, repeats, priority, `#List` and `!`
 * reminders are read out of the text when the "parse dates" setting is on.
 * The task and its reminder are one undo step.
 */
export function createItemFromText(
  listId: string,
  raw: string,
  place: Pick<NewItem, 'parentId' | 'after' | 'sectionId'> = {},
  /** The due date to use when the text doesn't give one (e.g. today, in the Today view). */
  defaultDue: string | null = null,
  /** Labels to put on the task whatever the text says (the label view's quick add). */
  extraLabelIds: string[] = [],
): string | null {
  const prepared = prepareFromText(listId, raw, place, defaultDue, extraLabelIds);
  if (!prepared) return null;
  return commit('New task', (tx) => insertPrepared(tx, prepared));
}

/** Adds one task per line, in order, as a single undo step. Returns the new ids. */
export function createItemsFromLines(
  listId: string,
  lines: string[],
  defaultDue: string | null = null,
  /** The section for lines that don't name one with `/section`. */
  sectionId: string | null = null,
  /** Labels to put on every task whatever the text says. */
  extraLabelIds: string[] = [],
): string[] {
  const prepared = lines.flatMap(
    (line) =>
      prepareFromText(listId, line, sectionId ? { sectionId } : {}, defaultDue, extraLabelIds) ??
      [],
  );
  if (!prepared.length) return [];
  return commit(prepared.length === 1 ? 'New task' : 'New tasks', (tx) =>
    prepared.map((p) => insertPrepared(tx, p)),
  );
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

/** Sets the priority of several tasks as one undo step. */
export function setPriorities(ids: string[], priority: Priority): void {
  commit(ids.length === 1 ? 'Priority' : 'Priorities', (tx) => {
    for (const id of ids) {
      if (tx.get('items', id)) tx.update('items', id, { priority });
    }
  });
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

/**
 * Sets the due date of several tasks as one undo step, keeping each one's time.
 * `null` clears the date, time and repeat (as `clearDue` does).
 */
export function setDueDates(ids: string[], dueDate: string | null): void {
  if (dueDate !== null && !isDateKey(dueDate)) return;
  commit(ids.length === 1 ? 'Due date' : 'Reschedule tasks', (tx) => {
    for (const id of ids) {
      if (!tx.get('items', id)) continue;
      if (dueDate === null)
        tx.update('items', id, { dueDate: null, dueTime: null, recurrence: null });
      else tx.update('items', id, { dueDate });
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
  return commit(checked ? 'Complete task' : 'Reopen task', (tx) => checkInTx(tx, id, checked));
}

function checkInTx(tx: Tx, id: string, checked: boolean): string | null {
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
}

/** Checks or unchecks several tasks as one undo step (each as `setChecked` would). */
export function setCheckedMany(ids: string[], checked: boolean): void {
  commit(checked ? 'Complete tasks' : 'Reopen tasks', (tx) => {
    // Completing a parent completes its subtasks (or, for a repeating one, resets them), so a
    // subtask selected with it is left to the parent; the order must not matter.
    const targets = checked ? withoutDescendants((id) => tx.get('items', id), ids) : ids;
    for (const id of targets) checkInTx(tx, id, checked);
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
    // At the top level only the tasks in the same section count as "above".
    const group = item.parentId ? null : sectionOf(tx, item);
    const sibs = item.parentId
      ? shownSiblings(tx, item)
      : shownSiblings(tx, item).filter((s) => sectionOf(tx, s) === group);
    const prev = sibs[sibs.findIndex((s) => s.id === id) - 1];
    if (!prev || !fitsDeeper(tx, item, 1)) return false;
    const moved = tx.update('items', id, {
      parentId: prev.id,
      sectionId: null,
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
      // Back at the top level, it joins the section its parent is in.
      sectionId: parent.parentId ? null : sectionOf(tx, parent),
      sortKey: keyAfter(tx, item.listId, parent.parentId, parent.id, id),
    });
    return true;
  });
}

/**
 * Swaps an item with the sibling above (-1) or below (1). Returns false at either end.
 * A top-level task at the edge of its section crosses into the neighbouring one: the
 * end of the section above, or the start of the one below. "No section" is the first
 * group; a collapsed or empty section is still entered.
 */
export function moveItemBy(id: string, direction: -1 | 1): boolean {
  return commit('Move task', (tx) => {
    const item = tx.get('items', id);
    if (!item || (item.checked && !item.parentId)) return false;
    const shown = shownSiblings(tx, item);
    const group = item.parentId ? null : sectionOf(tx, item);
    // Within a section, only its own tasks are neighbours.
    const sibs = item.parentId ? shown : shown.filter((s) => sectionOf(tx, s) === group);
    const i = sibs.findIndex((s) => s.id === id);
    if (i < 0) return false;
    const target = i + direction;
    if (target >= 0 && target < sibs.length) {
      const [before, after] =
        direction < 0 ? [sibs[target - 1], sibs[target]] : [sibs[target], sibs[target + 1]];
      tx.update('items', id, {
        sortKey: keyBetween(before?.sortKey ?? null, after?.sortKey ?? null),
      });
      return true;
    }
    if (item.parentId) return false;
    // At the edge: into the neighbouring group.
    const groups = [null, ...listSections(tx, item.listId).map((s) => s.id)];
    const g = groups.indexOf(group);
    const next = groups[g + direction];
    if (g < 0 || next === undefined) return false;
    const others = shown.filter((s) => s.id !== id);
    if (direction < 0) {
      tx.update('items', id, { sectionId: next, sortKey: keyAt(others, others.length) });
    } else {
      const first = others.findIndex((s) => sectionOf(tx, s) === next);
      tx.update('items', id, {
        sectionId: next,
        sortKey: keyAt(others, first < 0 ? others.length : first),
      });
    }
    return true;
  });
}

/** The section of the top-level task above `item` (or of `item` itself if it is one). */
function topSection(tx: Tx, item: Item): string | null {
  let top = item;
  for (let guard = 0; top.parentId && guard < 50; guard++) {
    const parent = tx.get('items', top.parentId);
    if (!parent) break;
    top = parent;
  }
  return sectionOf(tx, top);
}

/**
 * Moves an item (with its subtasks) under `parentId`, after the sibling `after` (null = first).
 * For a top-level drop, `sectionId` is the section it lands in (null = none); left out, a
 * top-level task stays where it is and a subtask takes the section of its top-level ancestor.
 * Becoming a subtask clears the section. `after` should be a task in the target section.
 */
export function moveItem(
  id: string,
  parentId: string | null,
  after: string | null,
  sectionId?: string | null,
): void {
  commit('Move task', (tx) => {
    const item = tx.get('items', id);
    if (!item || id === parentId) return;
    if (parentId && descendantIds(itemIndex(tx, item.listId), id).includes(parentId)) return;
    let section: string | null = null;
    if (!parentId) {
      const wanted = sectionId !== undefined ? sectionId : topSection(tx, item);
      if (wanted && tx.get('sections', wanted)?.listId === item.listId) section = wanted;
    }
    const moved = tx.update('items', id, {
      parentId,
      sectionId: section,
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
      sectionId: null,
      sortKey: keyAfter(tx, listId, null, undefined),
    });
    for (const childId of subtasks) tx.update('items', childId, { listId });
  });
}

/** `ids` without any task whose parent (or higher ancestor) is also in `ids`. */
export function withoutDescendants(get: (id: string) => Item | undefined, ids: string[]): string[] {
  const chosen = new Set(ids);
  return ids.filter((id) => {
    let parent = get(get(id)?.parentId ?? '');
    for (let guard = 0; parent && guard < 50; guard++) {
      if (chosen.has(parent.id)) return false;
      parent = get(parent.parentId ?? '');
    }
    return true;
  });
}

/**
 * Moves several tasks (each with its subtasks) to another to-do list as one
 * undo step. A task selected along with its parent goes with the parent;
 * one whose parent stays behind becomes a top-level task, as a single move does.
 */
export function moveItemsToList(ids: string[], listId: string): void {
  commit(ids.length === 1 ? 'Move task' : 'Move tasks', (tx) => {
    const target = tx.get('lists', listId);
    if (!target || target.type !== 'todo' || target.archivedAt || target.deletedAt) return;
    for (const id of withoutDescendants((id) => tx.get('items', id), ids)) {
      const item = tx.get('items', id);
      if (!item || item.deletedAt || item.listId === listId) continue;
      const subtasks = descendantIds(itemIndex(tx, item.listId), id);
      tx.update('items', id, {
        listId,
        parentId: null,
        sectionId: null,
        sortKey: keyAfter(tx, listId, null, undefined),
      });
      for (const childId of subtasks) tx.update('items', childId, { listId });
    }
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
        labelIds: [...(source.labelIds ?? [])],
        createdAt: tx.now,
        updatedAt: tx.now,
      });
    }
    const copy = tx.get('items', ids.get(id))!;
    reopenAncestors(tx, copy);
    return copy.id;
  });
}
