import { format } from 'date-fns';
import type { Item, List } from '@/data/types';
import { addDaysKey, fromDateKey, minutesOf, startOfWeekKey, type DateKey } from '@/lib/dates';
import { bySortKey } from '@/lib/order';
import { openRows, type DueRow } from './smart';
import type { FeedEvent } from './feeds';

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

/** No block is drawn shorter than this (20px at 48px an hour: a line of small text and its border). */
export const MIN_BLOCK_MINUTES = 25;

/** What a calendar day holds: a task, or a read-only event from a calendar link. */
export type CalendarEntry = { kind: 'task'; row: DueRow } | { kind: 'event'; event: FeedEvent };

/**
 * Everything on each day, in one list: all-day entries first (events, then
 * tasks, each in arrival order), then timed entries by start time with events
 * and tasks mixed. On the same start time an event comes before a task;
 * otherwise arrival order holds. Days with neither have no entry.
 */
export function entriesByDay(
  rows: DueRow[],
  events: Map<DateKey, FeedEvent[]>,
): Map<DateKey, CalendarEntry[]> {
  const byDay = new Map<DateKey, CalendarEntry[]>();
  for (const [date, list] of events) {
    if (list.length)
      byDay.set(
        date,
        list.map((event) => ({ kind: 'event', event })),
      );
  }
  for (const [date, list] of rowsByDay(rows)) {
    const tasks = list.map((row): CalendarEntry => ({ kind: 'task', row }));
    const bucket = byDay.get(date);
    if (bucket) bucket.push(...tasks);
    else byDay.set(date, tasks);
  }
  for (const [date, list] of byDay) {
    const keyed = list.map((entry, order) => ({
      entry,
      order,
      start: entrySpan(entry)?.start ?? null,
    }));
    const allDay = keyed.filter((k) => k.start === null);
    const timed = keyed
      .filter((k) => k.start !== null)
      .sort(
        (a, b) =>
          a.start! - b.start! ||
          Number(a.entry.kind === 'task') - Number(b.entry.kind === 'task') ||
          a.order - b.order,
      );
    byDay.set(
      date,
      [...allDay, ...timed].map((k) => k.entry),
    );
  }
  return byDay;
}

/** A timed entry placed on a day's time grid. */
export interface PlacedBlock<T> {
  value: T;
  /** Minutes from midnight. */
  start: number;
  end: number;
  /** Which column of its overlap cluster the block sits in, from 0. */
  lane: number;
  /** How many columns its overlap cluster has. */
  lanes: number;
}

/** A timed task placed on a day's time grid. */
export interface TimedBlock {
  row: DueRow;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/**
 * Lays out blocks that may overlap. Blocks that overlap share the width: each
 * takes the first lane whose last block has ended, and `lanes` counts the
 * lanes of its cluster (blocks that overlap one another, directly or through
 * others).
 */
function layoutBlocks<T>(inputs: { value: T; start: number; end: number }[]): PlacedBlock<T>[] {
  const blocks = inputs
    .map((input, order) => ({ ...input, order }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order);
  const placed: PlacedBlock<T>[] = [];
  let cluster: PlacedBlock<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const closeCluster = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const { value, start, end } of blocks) {
    // A block is drawn at least MIN_BLOCK_MINUTES tall, so lanes are given out as if it ran that long.
    const drawnEnd = Math.max(end, start + MIN_BLOCK_MINUTES);
    if (cluster.length && start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = drawnEnd;
    clusterEnd = cluster.length ? Math.max(clusterEnd, drawnEnd) : drawnEnd;
    const block: PlacedBlock<T> = { value, start, end, lane, lanes: 1 };
    cluster.push(block);
    placed.push(block);
  }
  closeCluster();
  return placed;
}

/** The start and end, in minutes, of an entry with a time; null for an all-day one. */
function entrySpan(entry: CalendarEntry): { start: number; end: number } | null {
  const [startTime, endTime] =
    entry.kind === 'task'
      ? [entry.row.item.dueTime, entry.row.item.endTime]
      : [entry.event.startTime, entry.event.endTime];
  if (!startTime) return null;
  const start = minutesOf(startTime);
  return { start, end: endTime ? minutesOf(endTime) : start + DEFAULT_BLOCK_MINUTES };
}

/**
 * The tasks with a due time as blocks on a time grid. A task with no end is 30
 * minutes long.
 */
export function timedBlocks(rows: DueRow[]): TimedBlock[] {
  const inputs = rows.flatMap((row) => {
    const span = entrySpan({ kind: 'task', row });
    return span ? [{ value: row, ...span }] : [];
  });
  return layoutBlocks(inputs).map(({ value, ...rest }) => ({ row: value, ...rest }));
}

/**
 * Tasks and events with a time as blocks, sharing lanes so none sits on top
 * of another. An event with no end is 30 minutes long, like a task.
 */
export function timedEntryBlocks(entries: CalendarEntry[]): PlacedBlock<CalendarEntry>[] {
  return layoutBlocks(
    entries.flatMap((entry) => {
      const span = entrySpan(entry);
      return span ? [{ value: entry, ...span }] : [];
    }),
  );
}

/** The rows without a due time, for a day's all-day row. */
export function allDayRows(rows: DueRow[]): DueRow[] {
  return rows.filter((row) => !row.item.dueTime);
}

/** The entries without a time, for a day's all-day row. */
export function allDayEntries(entries: CalendarEntry[]): CalendarEntry[] {
  return entries.filter((entry) => entrySpan(entry) === null);
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
