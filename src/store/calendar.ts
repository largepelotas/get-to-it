import { format } from 'date-fns';
import type { Item, List } from '@/data/types';
import { addDaysKey, fromDateKey, minutesOf, startOfWeekKey, type DateKey } from '@/lib/dates';
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

/** How tall a task with no end time is drawn, in minutes. */
const DEFAULT_BLOCK_MINUTES = 30;

/** A timed task placed on a day's time grid. */
export interface TimedBlock {
  row: DueRow;
  /** Minutes from midnight. */
  start: number;
  end: number;
  /** Which column of its overlap cluster the block sits in, from 0. */
  lane: number;
  /** How many columns its overlap cluster has. */
  lanes: number;
}

/**
 * The rows with a due time as blocks on a time grid. A task with no end is 30
 * minutes long. Blocks that overlap share the width: each takes the first lane
 * whose last block has ended, and `lanes` counts the lanes of its cluster
 * (blocks that overlap one another, directly or through others).
 */
export function timedBlocks(rows: DueRow[]): TimedBlock[] {
  const blocks = rows
    .filter((row) => row.item.dueTime)
    .map((row, order) => {
      const start = minutesOf(row.item.dueTime!);
      const end = row.item.endTime ? minutesOf(row.item.endTime) : start + DEFAULT_BLOCK_MINUTES;
      return { row, start, end, order };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order);
  const placed: TimedBlock[] = [];
  let cluster: TimedBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const closeCluster = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const { row, start, end } of blocks) {
    if (cluster.length && start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    clusterEnd = cluster.length ? Math.max(clusterEnd, end) : end;
    const block: TimedBlock = { row, start, end, lane, lanes: 1 };
    cluster.push(block);
    placed.push(block);
  }
  closeCluster();
  return placed;
}

/** The rows without a due time, for a day's all-day row. */
export function allDayRows(rows: DueRow[]): DueRow[] {
  return rows.filter((row) => !row.item.dueTime);
}

/**
 * The minutes from midnight at a pointer `offsetPx` from the top of a day
 * column drawn `hourPx` per hour: rounded down to a quarter hour and kept
 * within 00:00 to 23:45.
 */
export function slotFromOffset(offsetPx: number, hourPx: number): number {
  const slot = Math.floor(((offsetPx / hourPx) * 60) / 15) * 15;
  return Math.min(1425, Math.max(0, slot));
}
