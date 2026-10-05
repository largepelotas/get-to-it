import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useLayoutEffect, useRef } from 'react';
import { alldayDropId, slotDropId } from '@/components/views/dayDrop';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, formatTime, fromDateKey, timeOfMinutes, type DateKey } from '@/lib/dates';
import {
  allDayEntries,
  MIN_BLOCK_MINUTES,
  timedEntryBlocks,
  type CalendarEntry,
} from '@/store/calendar';
import { EventChip } from './EventChip';
import { TaskChip } from './TaskChip';

/** How tall one hour is on the time grid, in pixels. */
export const HOUR_PX = 48;

/** The hour the grid scrolls to when the shown days have nothing earlier. */
const DEFAULT_TOP_HOUR = 7;

/** Where a dragged task would land: a day and minutes from midnight. */
export interface SlotGhost {
  date: DateKey;
  minutes: number;
}

/** What every task chip on the grid needs to know besides its row. */
interface ChipState {
  selectedId: string | null;
  reminded: Set<string>;
  focusedId: string | null;
}

const GRID_COLUMNS = (days: number) => ({
  gridTemplateColumns: `3.5rem repeat(${days}, minmax(0, 1fr))`,
});

/** A day's all-day cell: its untimed tasks, and a drop target that clears a task's time. */
function AllDayCell({
  date,
  entries,
  state,
}: {
  date: DateKey;
  entries: CalendarEntry[];
  state: ChipState;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: alldayDropId(date) });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`All day, ${formatLongDate(date)}`}
      className={clsx(
        'min-h-8 min-w-0 border-l border-line p-0.5',
        isOver && 'bg-hover ring-1 ring-accent',
      )}
    >
      {entries.length > 0 && (
        <ul role="list" className="flex flex-col gap-0.5">
          {entries.map((entry) =>
            entry.kind === 'event' ? (
              <EventChip
                key={`event:${entry.event.feedId}:${entry.event.id}`}
                event={entry.event}
                placement="allDay"
              />
            ) : (
              <TaskChip
                key={entry.row.item.id}
                row={entry.row}
                selected={entry.row.item.id === state.selectedId}
                hasReminder={state.reminded.has(entry.row.item.id)}
                focusing={entry.row.item.id === state.focusedId}
                placement="allDay"
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/** A day's column of the time grid: hour lines, its timed tasks as blocks, and a drop target for times. */
function DayColumn({
  date,
  entries,
  state,
  nowMinutes,
  ghost,
}: {
  date: DateKey;
  entries: CalendarEntry[];
  state: ChipState;
  /** Minutes from midnight now, when this column is today's; otherwise null. */
  nowMinutes: number | null;
  ghost: SlotGhost | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotDropId(date) });
  const blocks = timedEntryBlocks(entries);
  return (
    <section
      ref={setNodeRef}
      aria-label={formatLongDate(date)}
      className={clsx('relative min-w-0 border-l border-line', isOver && 'bg-hover')}
      style={{ height: 24 * HOUR_PX }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="h-12 border-t border-line first:border-t-0" />
      ))}
      {blocks.length > 0 && (
        <ul role="list" className="absolute inset-0">
          {blocks.map((block) => {
            // A block that would run past midnight (a 23:45 task with no end) stops at the bottom,
            // moving up if that leaves it shorter than the least a block is drawn.
            const minutes = Math.max(Math.min(block.end, 24 * 60) - block.start, MIN_BLOCK_MINUTES);
            const place = {
              top: (Math.min(block.start, 24 * 60 - minutes) / 60) * HOUR_PX,
              height: (minutes / 60) * HOUR_PX,
              left: `${(block.lane / block.lanes) * 100}%`,
              width: `calc(${100 / block.lanes}% - 2px)`,
            };
            const entry = block.value;
            return entry.kind === 'event' ? (
              <EventChip
                key={`event:${entry.event.feedId}:${entry.event.id}`}
                event={entry.event}
                placement="block"
                block={place}
              />
            ) : (
              <TaskChip
                key={entry.row.item.id}
                row={entry.row}
                selected={entry.row.item.id === state.selectedId}
                hasReminder={state.reminded.has(entry.row.item.id)}
                focusing={entry.row.item.id === state.focusedId}
                placement="block"
                block={place}
              />
            );
          })}
        </ul>
      )}
      {ghost && ghost.date === date && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 rounded-sm bg-accent-soft/50"
          style={{ top: (ghost.minutes / 60) * HOUR_PX, height: HOUR_PX / 2 }}
        />
      )}
      {nowMinutes !== null && (
        <div
          aria-hidden
          data-testid="now-line"
          className="pointer-events-none absolute inset-x-0 h-0.5 bg-danger"
          style={{ top: (nowMinutes / 60) * HOUR_PX - 1 }}
        >
          <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-danger" />
        </div>
      )}
    </section>
  );
}

/**
 * The week and 3-day layouts: a heading and an all-day cell per day, then a
 * scrolling grid of hours with one column per day. Timed tasks are blocks from
 * their start to their end; dropping a task on a column picks a time.
 */
export function TimeGrid({
  days,
  today,
  byDay,
  selectedId,
  reminded,
  focusedId,
  ghost,
}: {
  days: DateKey[];
  today: DateKey;
  byDay: Map<DateKey, CalendarEntry[]>;
  selectedId: string | null;
  reminded: Set<string>;
  focusedId: string | null;
  ghost: SlotGhost | null;
}) {
  const state: ChipState = { selectedId, reminded, focusedId };
  const now = new Date(useNow());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Scroll to the morning (or an hour before the earliest task) when the days change.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Only when the days change, not each time a task does.
    const key = days.join(',');
    if (scrolledFor.current === key || !scrollRef.current) return;
    scrolledFor.current = key;
    let earliest = Infinity;
    for (const date of days) {
      for (const block of timedEntryBlocks(byDay.get(date) ?? []))
        earliest = Math.min(earliest, block.start);
    }
    const top = Math.max(0, Math.min(DEFAULT_TOP_HOUR * 60, earliest - 60));
    scrollRef.current.scrollTop = (top / 60) * HOUR_PX;
  }, [days, byDay]);

  const columns = GRID_COLUMNS(days.length);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
      <div
        className="grid shrink-0 [scrollbar-gutter:stable] overflow-y-hidden border-b border-line"
        style={columns}
      >
        <div />
        {days.map((date) => {
          const isToday = date === today;
          return (
            <h2
              key={date}
              className="flex items-center justify-center gap-1.5 border-l border-line py-1.5 text-xs font-medium text-fg-muted"
            >
              <span>{format(fromDateKey(date), 'EEE')}</span>
              <span
                aria-current={isToday ? 'date' : undefined}
                className={clsx(
                  'flex h-6 min-w-6 items-center justify-center px-1 text-sm',
                  isToday ? 'rounded-full bg-accent font-semibold text-accent-fg' : 'text-fg',
                )}
              >
                {fromDateKey(date).getDate()}
              </span>
            </h2>
          );
        })}
      </div>
      <div
        className="grid shrink-0 [scrollbar-gutter:stable] overflow-y-hidden border-b border-line"
        style={columns}
      >
        <div className="px-1 py-1.5 text-right text-xs text-fg-muted">All day</div>
        {days.map((date) => (
          <AllDayCell
            key={date}
            date={date}
            entries={allDayEntries(byDay.get(date) ?? [])}
            state={state}
          />
        ))}
      </div>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Hours"
        tabIndex={0}
        className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-inset"
      >
        <div className="grid" style={columns}>
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute right-1 -translate-y-1/2 text-[11px] text-fg-subtle"
                style={{ top: (i + 1) * HOUR_PX }}
              >
                {formatTime(timeOfMinutes((i + 1) * 60))}
              </span>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={date}
              date={date}
              entries={byDay.get(date) ?? []}
              state={state}
              nowMinutes={date === today ? nowMinutes : null}
              ghost={ghost}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
