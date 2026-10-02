import { useDroppable } from '@dnd-kit/core';
import clsx from 'clsx';
import { format } from 'date-fns';
import { formatLongDate, fromDateKey, type DateKey } from '@/lib/dates';
import { dayDropId } from '@/components/views/dayDrop';
import { monthGrid } from '@/store/calendar';
import type { DueRow } from '@/store/smart';
import { TaskChip } from './TaskChip';

/** One day of the month grid: its number and task chips; a drop target for dragged tasks. */
function DayCell({
  date,
  today,
  inMonth,
  rows,
  selectedId,
  reminded,
  focusedId,
}: {
  date: DateKey;
  today: DateKey;
  inMonth: boolean;
  rows: DueRow[];
  selectedId: string | null;
  reminded: Set<string>;
  focusedId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date) });
  const day = fromDateKey(date);
  const long = formatLongDate(date);
  const name = rows.length
    ? `${long}, ${rows.length === 1 ? '1 task' : `${rows.length} tasks`}`
    : long;
  const isToday = date === today;
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
      {rows.length > 0 && (
        <ul role="list" className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <TaskChip
              key={row.item.id}
              row={row}
              selected={row.item.id === selectedId}
              hasReminder={reminded.has(row.item.id)}
              focusing={row.item.id === focusedId}
            />
          ))}
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
  byDay: Map<DateKey, DueRow[]>;
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
                rows={byDay.get(date) ?? []}
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
