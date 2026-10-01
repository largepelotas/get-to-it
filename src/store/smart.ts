import type { Item, List } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { addDaysKey, type DateKey } from '@/lib/dates';
import type { FlatRow } from './tree';

/** A task shown in Today or Upcoming, with the list it comes from. */
export interface DueRow extends FlatRow {
  list: List;
  /** The parent task, for subtasks. */
  parent: Item | null;
}

export interface DayGroup {
  date: DateKey;
  rows: DueRow[];
}

export interface TodayModel {
  overdue: DueRow[];
  today: DueRow[];
}

/**
 * Timed tasks first, by time, then the rest by priority (P1 first, none
 * last), then by list and position in the list.
 */
function compareDue(a: DueRow, b: DueRow): number {
  const ia = a.item;
  const ib = b.item;
  if (ia.dueDate !== ib.dueDate) return (ia.dueDate ?? '') < (ib.dueDate ?? '') ? -1 : 1;
  if (!!ia.dueTime !== !!ib.dueTime) return ia.dueTime ? -1 : 1;
  if (ia.dueTime && ib.dueTime && ia.dueTime !== ib.dueTime)
    return ia.dueTime < ib.dueTime ? -1 : 1;
  const pa = ia.priority || 4;
  const pb = ib.priority || 4;
  if (pa !== pb) return pa - pb;
  if (a.list.id !== b.list.id) return bySortKey(a.list, b.list);
  return bySortKey(ia, ib);
}

/** Open tasks with a due date from every to-do list that isn't archived or in the Trash. */
export function dueRows(items: Record<string, Item>, lists: Record<string, List>): DueRow[] {
  const live = Object.values(items).filter((i) => {
    const list = lists[i.listId];
    return !i.deletedAt && list && list.type === 'todo' && !list.deletedAt && !list.archivedAt;
  });
  const children = new Map<string, Item[]>();
  for (const item of live) {
    if (!item.parentId) continue;
    const bucket = children.get(item.parentId);
    if (bucket) bucket.push(item);
    else children.set(item.parentId, [item]);
  }
  const byId = new Map(live.map((i) => [i.id, i]));
  return live
    .filter((i) => i.dueDate && !i.checked)
    .map((item) => {
      const subs = children.get(item.id) ?? [];
      return {
        item,
        depth: 0,
        childCount: subs.length,
        doneCount: subs.filter((s) => s.checked).length,
        list: lists[item.listId],
        parent: (item.parentId && byId.get(item.parentId)) || null,
      };
    })
    .sort(compareDue);
}

/** Overdue tasks (due before today) and tasks due today. */
export function todayModel(rows: DueRow[], today: DateKey): TodayModel {
  return {
    overdue: rows.filter((r) => r.item.dueDate! < today),
    today: rows.filter((r) => r.item.dueDate === today),
  };
}

/** Tasks due after today, grouped by day in date order. */
export function upcomingModel(rows: DueRow[], today: DateKey): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const date = row.item.dueDate!;
    if (date <= today) continue;
    const last = groups[groups.length - 1];
    if (last?.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups;
}

/** How many tasks Today shows, for the sidebar. */
export function todayCount(rows: DueRow[], today: DateKey): number {
  return rows.filter((r) => r.item.dueDate! <= today).length;
}

/** Tasks due tomorrow, in the same order as Today. */
export function tomorrowModel(rows: DueRow[], today: DateKey): DueRow[] {
  const tomorrow = addDaysKey(today, 1);
  return rows.filter((r) => r.item.dueDate === tomorrow);
}

export function tomorrowCount(rows: DueRow[], today: DateKey): number {
  return tomorrowModel(rows, today).length;
}

export interface Next7Model {
  overdue: DueRow[];
  /** Today and the six days after it, every one present even when it has no tasks. */
  days: DayGroup[];
}

/** Overdue tasks, then each of the next seven days (today first). */
export function next7Model(rows: DueRow[], today: DateKey): Next7Model {
  const days: DayGroup[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDaysKey(today, i),
    rows: [],
  }));
  const overdue: DueRow[] = [];
  for (const row of rows) {
    const date = row.item.dueDate!;
    if (date < today) overdue.push(row);
    else days.find((d) => d.date === date)?.rows.push(row);
  }
  return { overdue, days };
}

/** How many tasks Next 7 days shows, for the sidebar: overdue plus the seven days. */
export function next7Count(rows: DueRow[], today: DateKey): number {
  const { overdue, days } = next7Model(rows, today);
  return overdue.length + days.reduce((sum, d) => sum + d.rows.length, 0);
}
