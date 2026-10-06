import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useState } from 'react';
import { Popover } from '@/components/ui/Popover';
import { formatLongDate, fromDateKey, type DateKey } from '@/lib/dates';
import { dayDropId } from '@/components/views/dayDrop';
import { monthGrid, type CalendarEntry } from '@/store/calendar';
import { EventChip } from './EventChip';
import { TaskChip } from './TaskChip';

/** A day shows at most this many entries; any more go behind a "+N more" button after them. */
export const MAX_DAY_ENTRIES = 3;

/** One day of the month grid: its number and task chips; a drop target for dragged tasks. */
function DayCell({
  date,
  today,
  inMonth,
  entries,
  selectedId,
  reminded,
  focusedId,
}: {
  date: DateKey;
  today: DateKey;
  inMonth: boolean;
  entries: CalendarEntry[];
  selectedId: string | null;
  reminded: Set<string>;
  focusedId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date) });
  const day = fromDateKey(date);
  const long = formatLongDate(date);
  const tasks = entries.filter((e) => e.kind === 'task').length;
  const events = entries.length - tasks;
  const counts = [
    tasks && (tasks === 1 ? '1 task' : `${tasks} tasks`),
    events && (events === 1 ? '1 event' : `${events} events`),
  ].filter(Boolean);
  const name = counts.length ? `${long}, ${counts.join(', ')}` : long;
  const isToday = date === today;
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = entries.length > MAX_DAY_ENTRIES;
  const shownEntries = overflow ? entries.slice(0, MAX_DAY_ENTRIES) : entries;
  const hidden = entries.length - shownEntries.length;
  const renderEntry = (entry: CalendarEntry, inPopover: boolean) =>
    entry.kind === 'event' ? (
      <EventChip key={`event:${entry.event.feedId}:${entry.event.id}`} event={entry.event} />
    ) : (
      <TaskChip
        key={entry.row.item.id}
        row={entry.row}
        selected={entry.row.item.id === selectedId}
        hasReminder={reminded.has(entry.row.item.id)}
        focusing={entry.row.item.id === focusedId}
        inPopover={inPopover}
        onOpen={inPopover ? () => setMoreOpen(false) : undefined}
      />
    );
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={clsx(
        'flex min-h-24 min-w-0 flex-col gap-1 border-r border-b border-line p-1',
        isOver && 'bg-hover ring-1 ring-accent',
      )}
    >
      <div className="flex justify-end">
        <span
          aria-current={isToday ? 'date' : undefined}
          className={clsx(
            'flex h-6 min-w-6 items-center justify-center px-1 text-xs',
            isToday
              ? 'rounded-full bg-accent font-semibold text-accent-fg'
              : inMonth
                ? 'text-fg'
                : 'text-fg-subtle',
          )}
        >
          {day.getDate() === 1 ? format(day, 'MMM d') : day.getDate()}
        </span>
      </div>
      {entries.length > 0 && (
        <ul role="list" className="flex flex-col gap-0.5">
          {shownEntries.map((entry) => renderEntry(entry, false))}
          {overflow && (
            <li>
              <Popover
                open={moreOpen}
                onOpenChange={setMoreOpen}
                label={long}
                className="w-64"
                trigger={
                  <button
                    type="button"
                    aria-label={`${hidden} more on ${long}`}
                    className="w-full cursor-pointer rounded-sm px-1.5 py-0.5 text-left text-xs text-fg-muted transition-colors hover:bg-hover"
                  >
                    +{hidden} more
                  </button>
                }
              >
                <h2 className="mb-2 font-semibold text-fg">{long}</h2>
                <ul role="list" className="flex flex-col gap-0.5">
                  {entries.map((entry) => renderEntry(entry, true))}
                </ul>
              </Popover>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The month that holds `anchor` as weeks of days, each day holding its tasks. */
export function MonthGrid({
  anchor,
  today,
  weekStartsOn,
  byDay,
  selectedId,
  reminded,
  focusedId,
}: {
  anchor: DateKey;
  today: DateKey;
  weekStartsOn: 0 | 1;
  byDay: Map<DateKey, CalendarEntry[]>;
  selectedId: string | null;
  reminded: Set<string>;
  focusedId: string | null;
}) {
  const weeks = monthGrid(anchor, weekStartsOn);
  const month = anchor.slice(0, 7);
  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pb-6">
      <div className="flex min-h-full flex-col border-t border-l border-line">
        <div className="grid grid-cols-7 border-b border-line text-xs text-fg-muted">
          {weeks[0].map((date) => (
            <div key={date} className="px-2 py-1.5 text-center font-medium">
              {format(fromDateKey(date), 'EEE')}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid flex-1 grid-cols-7">
            {week.map((date) => (
              <DayCell
                key={date}
                date={date}
                today={today}
                inMonth={date.startsWith(month)}
                entries={byDay.get(date) ?? []}
                selectedId={selectedId}
                reminded={reminded}
                focusedId={focusedId}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
