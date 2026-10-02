import { format } from 'date-fns';
import type { Item, List } from '@/data/types';
import { addDaysKey, fromDateKey, startOfWeekKey, type DateKey } from '@/lib/dates';
import { bySortKey } from '@/lib/order';
import { openRows, type DueRow } from './smart';

/** The weeks of the month that holds `anchor`: from the week with the 1st to the week with the last day. */
export function monthGrid(anchor: DateKey, weekStartsOn: 0 | 1): DateKey[][] {
  const first = `${anchor.slice(0, 8)}01`;
  const last = addDaysKey(`${anchor.slice(0, 8)}01`, daysInMonth(anchor) - 1);
  const weeks: DateKey[][] = [];
  for (
    let start = startOfWeekKey(first, weekStartsOn);
    start <= last;
    start = addDaysKey(start, 7)
  ) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysKey(start, i)));
  }
  return weeks;
}

function daysInMonth(key: DateKey): number {
  const date = fromDateKey(key);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** "October 2026". */
export function monthTitle(anchor: DateKey): string {
  return format(fromDateKey(anchor), 'MMMM yyyy');
}

/**
 * The span of a run of days: "Sep 28 – Oct 4, 2026", "Oct 2 – 4, 2026", or
 * with both years when it crosses New Year.
 */
export function rangeTitle(days: DateKey[]): string {
  const first = fromDateKey(days[0]);
  const last = fromDateKey(days[days.length - 1]);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${format(first, 'MMM d, yyyy')} – ${format(last, 'MMM d, yyyy')}`;
  }
  const year = first.getFullYear();
  if (first.getMonth() === last.getMonth()) {
    return `${format(first, 'MMM d')} – ${last.getDate()}, ${year}`;
  }
  return `${format(first, 'MMM d')} – ${format(last, 'MMM d')}, ${year}`;
}

/** The rows on each day, in the rows' own order. Days without rows have no entry. */
export function rowsByDay(rows: DueRow[]): Map<DateKey, DueRow[]> {
  const byDay = new Map<DateKey, DueRow[]>();
  for (const row of rows) {
    const date = row.item.dueDate;
    if (!date) continue;
    const bucket = byDay.get(date);
    if (bucket) bucket.push(row);
    else byDay.set(date, [row]);
  }
  return byDay;
}

/** Open tasks with no due date from every live to-do list, by list and then position. */
export function unscheduledRows(
  items: Record<string, Item>,
  lists: Record<string, List>,
): DueRow[] {
  return openRows(items, lists, (i) => !i.dueDate).sort(
    (a, b) => bySortKey(a.list, b.list) || bySortKey(a.item, b.item),
  );
}

/** Rows grouped by their list, in sidebar order, leaving out lists with none. */
export function unscheduledSections(
  rows: DueRow[],
  lists: List[],
): { list: List; rows: DueRow[] }[] {
  return [...lists]
    .sort(bySortKey)
    .map((list) => ({ list, rows: rows.filter((r) => r.list.id === list.id) }))
    .filter((section) => section.rows.length > 0);
}
