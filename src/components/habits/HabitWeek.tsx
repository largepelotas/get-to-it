import clsx from 'clsx';
import { format } from 'date-fns';
import { fromDateKey, type DateKey } from '@/lib/dates';

export interface HabitWeekProps {
  /** The last seven days, oldest first, ending today. */
  week: DateKey[];
  /** The days with a check-in. */
  days: ReadonlySet<DateKey>;
  readOnly: boolean;
  /** 0 takes the buttons out of the Tab order (the habit list reaches them from the selected row). */
  tabIndex?: 0 | -1;
  className?: string;
  onToggleDay: (day: DateKey) => void;
}

/** Seven small buttons, one per day, each ticking or unticking that day. */
export function HabitWeek({
  week,
  days,
  readOnly,
  tabIndex = 0,
  className,
  onToggleDay,
}: HabitWeekProps) {
  return (
    <div role="group" aria-label="Last 7 days" className={clsx('shrink-0 gap-1', className)}>
      {week.map((day) => {
        const done = days.has(day);
        return (
          <button
            key={day}
            type="button"
            tabIndex={tabIndex}
            disabled={readOnly}
            aria-pressed={done}
            aria-label={`${format(fromDateKey(day), 'EEE d MMM')}, ${done ? 'done' : 'not done'}`}
            onClick={() => onToggleDay(day)}
            className={clsx(
              'size-5 rounded-[5px] border text-[10px] leading-none font-medium disabled:opacity-50',
              done
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line-control text-fg-muted hover:bg-hover',
            )}
          >
            {format(fromDateKey(day), 'EEEEE')}
          </button>
        );
      })}
    </div>
  );
}
