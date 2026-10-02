import type { Item, List } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { addDaysKey, minutesOf, weekDays, type DateKey } from '@/lib/dates';
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
export function compareDue(a: DueRow, b: DueRow): number {
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
  return openRows(items, lists, (i) => !!i.dueDate);
}

/**
 * Rows for the open tasks that pass `wanted`, from every to-do list that isn't
 * archived or in the Trash, in the order Today uses.
 */
export function openRows(
  items: Record<string, Item>,
  lists: Record<string, List>,
  wanted: (item: Item) => boolean,
): DueRow[] {
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
    .filter((i) => wanted(i) && !i.checked)
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

export interface UpcomingModel {
  /** Tasks due before today; only when the view starts today. */
  overdue: DueRow[];
  /** From the starting day to the end of its week, every day; then later days that have tasks. */
  days: DayGroup[];
}

/**
 * What Upcoming shows from `from` (today or later): overdue tasks when `from`
 * is today, every day to the end of `from`'s week (empty ones too), then only
 * the later days that have tasks. Days between today and `from` are left out.
 */
export function upcomingModel(
  rows: DueRow[],
  today: DateKey,
  from: DateKey,
  weekStartsOn: 0 | 1,
): UpcomingModel {
  const week = weekDays(from, weekStartsOn).filter((d) => d >= from);
  const lastOfWeek = week[week.length - 1];
  const days: DayGroup[] = week.map((date) => ({ date, rows: [] }));
  const overdue: DueRow[] = [];
  for (const row of rows) {
    const date = row.item.dueDate!;
    if (date < today) {
      if (from === today) overdue.push(row);
    } else if (date >= from) {
      if (date <= lastOfWeek) days.find((d) => d.date === date)?.rows.push(row);
      else {
        const last = days[days.length - 1];
        if (last.date === date) last.rows.push(row);
        else days.push({ date, rows: [row] });
      }
    }
  }
  return { overdue, days };
}

/** How many open tasks are due on each date, for the week strip's badges. */
export function countByDay(rows: DueRow[]): Map<DateKey, number> {
  const counts = new Map<DateKey, number>();
  for (const row of rows) {
    const date = row.item.dueDate!;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
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

/** Minutes from start to end, summed over the rows that have both a due time and an end time. */
export function scheduledMinutes(rows: DueRow[]): number {
  let total = 0;
  for (const { item } of rows) {
    if (item.dueTime && item.endTime) total += minutesOf(item.endTime) - minutesOf(item.dueTime);
  }
  return total;
}
