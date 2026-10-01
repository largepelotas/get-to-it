import { ArrowRight, CalendarX, Sun, Sunrise } from 'lucide-react';
import type { ReactNode } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, nextWeekKey, toDateKey, type DateKey } from '@/lib/dates';
import { useData } from '@/store/data';

function Choice({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
    >
      <span className="flex size-4 items-center justify-center text-fg-muted">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

/**
 * Day choices for tasks that don't share one date (several selected, or
 * Today's overdue tasks): Today, Tomorrow, Next week, a calendar, and
 * optionally "No date". Loaded on first use, with the calendar.
 */
export function DateChoices({
  onPick,
  allowNone = false,
}: {
  onPick: (date: DateKey | null) => void;
  allowNone?: boolean;
}) {
  const today = useToday();
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  return (
    <div className="due-picker w-[252px] space-y-2">
      <div>
        <Choice icon={<Sun className="size-3.5" />} label="Today" onClick={() => onPick(today)} />
        <Choice
          icon={<Sunrise className="size-3.5" />}
          label="Tomorrow"
          onClick={() => onPick(addDaysKey(today, 1))}
        />
        <Choice
          icon={<ArrowRight className="size-3.5" />}
          label="Next week"
          onClick={() => onPick(nextWeekKey(today, weekStartsOn))}
        />
        {allowNone && (
          <Choice
            icon={<CalendarX className="size-3.5" />}
            label="No date"
            onClick={() => onPick(null)}
          />
        )}
      </div>
      <div className="border-t border-line pt-1">
        <DayPicker
          mode="single"
          weekStartsOn={weekStartsOn}
          showOutsideDays
          fixedWeeks
          onSelect={(date) => date && onPick(toDateKey(date))}
        />
      </div>
    </div>
  );
}
