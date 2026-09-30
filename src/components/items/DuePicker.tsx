import clsx from 'clsx';
import { ArrowRight, CalendarX, Sun, Sunrise, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { IconButton, Select } from '@/components/ui';
import { inputClass } from '@/components/ui/Input';
import type { Item, Recurrence, Weekday } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, fromDateKey, nextWeekKey, toDateKey, type DateKey } from '@/lib/dates';
import { describeRecurrence, WORKDAYS } from '@/lib/recurrence';
import { setDue, setDueTime, setRecurrence } from '@/store/actions/items';
import { useData } from '@/store/data';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UNITS: Record<Recurrence['freq'], [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

type Preset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const weekdayOf = (key: DateKey) => fromDateKey(key).getDay() as Weekday;

/** The repeat presets, as rules for a task due on `due`. */
function presetRule(preset: Preset, due: DateKey): Recurrence | null {
  const base = { interval: 1, mode: 'schedule' } as const;
  switch (preset) {
    case 'daily':
      return { ...base, freq: 'daily' };
    case 'weekdays':
      return { ...base, freq: 'weekly', weekdays: [...WORKDAYS] };
    case 'weekly':
      return { ...base, freq: 'weekly', weekdays: [weekdayOf(due)] };
    case 'monthly':
      return { ...base, freq: 'monthly' };
    case 'yearly':
      return { ...base, freq: 'yearly' };
    default:
      return null;
  }
}

/** Which preset a rule is, or `custom`. */
function presetOf(rule: Recurrence | null, due: DateKey): Preset {
  if (!rule) return 'none';
  if (rule.mode !== 'schedule' || rule.interval !== 1) return 'custom';
  if (rule.freq !== 'weekly') return rule.freq;
  const days = rule.weekdays?.length ? [...rule.weekdays].sort() : [weekdayOf(due)];
  if (days.join() === WORKDAYS.join()) return 'weekdays';
  if (days.length === 1 && days[0] === weekdayOf(due)) return 'weekly';
  return 'custom';
}

function QuickChoice({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
    >
      <span className="flex size-4 items-center justify-center text-fg-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </button>
  );
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={htmlFor} className="w-14 shrink-0 text-xs font-medium text-fg-muted">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  );
}

/** Every N units, the days of the week, and whether it follows a schedule or the last completion. */
function CustomRepeat({ item, rule }: { item: Item; rule: Recurrence }) {
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const [interval, setIntervalText] = useState(String(rule.interval));
  const days = rule.weekdays?.length ? rule.weekdays : [weekdayOf(item.dueDate!)];
  const order = Array.from({ length: 7 }, (_, i) => ((i + weekStartsOn) % 7) as Weekday);
  const update = (patch: Partial<Recurrence>) => setRecurrence(item.id, { ...rule, ...patch });

  return (
    <div className="space-y-2 rounded-md bg-sidebar p-2">
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        Every
        <input
          aria-label="Repeat every"
          type="number"
          min={1}
          max={999}
          value={interval}
          onChange={(e) => {
            setIntervalText(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= 999) update({ interval: n });
          }}
          onBlur={() => setIntervalText(String(rule.interval))}
          className="h-7 w-12 shrink-0 rounded-md border border-line-strong bg-surface px-1 text-center text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
        <Select
          aria-label="Repeat unit"
          value={rule.freq}
          onChange={(e) => {
            const freq = e.target.value as Recurrence['freq'];
            update({
              freq,
              weekdays: freq === 'weekly' ? [weekdayOf(item.dueDate!)] : undefined,
            });
          }}
          className="h-7 flex-1 text-xs"
        >
          {(Object.keys(UNITS) as Recurrence['freq'][]).map((freq) => (
            <option key={freq} value={freq}>
              {UNITS[freq][rule.interval === 1 ? 0 : 1]}
            </option>
          ))}
        </Select>
      </div>
      {rule.freq === 'weekly' && rule.mode === 'schedule' && (
        <div role="group" aria-label="Repeat on" className="flex justify-between">
          {order.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-label={WEEKDAY_LONG[d]}
                aria-pressed={on}
                onClick={() => {
                  if (on && days.length === 1) return;
                  update({ weekdays: on ? days.filter((x) => x !== d) : [...days, d] });
                }}
                className={clsx(
                  'size-7 rounded-full text-xs font-medium',
                  on ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-hover',
                )}
              >
                {WEEKDAY_LETTER[d]}
              </button>
            );
          })}
        </div>
      )}
      <Select
        aria-label="Repeat from"
        value={rule.mode}
        onChange={(e) => update({ mode: e.target.value as Recurrence['mode'] })}
        className="h-7 text-xs"
      >
        <option value="schedule">On a schedule</option>
        <option value="completion">After I finish it</option>
      </Select>
    </div>
  );
}

function RepeatField({ item }: { item: Item }) {
  const today = useToday();
  const due = item.dueDate ?? today;
  const preset = presetOf(item.recurrence, due);
  const [customOpen, setCustomOpen] = useState(preset === 'custom');
  const shown: Preset = customOpen && item.recurrence ? 'custom' : preset;
  const option = (p: Preset) => {
    const rule = presetRule(p, due);
    return rule ? describeRecurrence(rule, due) : '';
  };

  return (
    <>
      <FieldRow label="Repeat" htmlFor="due-picker-repeat">
        <Select
          id="due-picker-repeat"
          value={shown}
          onChange={(e) => {
            const next = e.target.value as Preset;
            setCustomOpen(next === 'custom');
            if (next === 'custom') {
              if (!item.recurrence) setRecurrence(item.id, presetRule('weekly', due));
            } else {
              setRecurrence(item.id, presetRule(next, due));
            }
          }}
          className="h-7 text-xs"
        >
          <option value="none">Doesn’t repeat</option>
          <option value="daily">{option('daily')}</option>
          <option value="weekdays">{option('weekdays')}</option>
          <option value="weekly">{option('weekly')}</option>
          <option value="monthly">{option('monthly')}</option>
          <option value="yearly">{option('yearly')}</option>
          <option value="custom">
            {shown === 'custom' && item.recurrence
              ? describeRecurrence(item.recurrence, due)
              : 'Custom…'}
          </option>
        </Select>
      </FieldRow>
      {shown === 'custom' && item.recurrence && item.dueDate && (
        <CustomRepeat item={item} rule={item.recurrence} />
      )}
    </>
  );
}

export interface DuePickerProps {
  item: Item;
  /** Called after choosing a day, so a popover can close. */
  onPicked?: () => void;
}

/** Due date, time and repeat for a task: quick choices, a calendar, a time field and a repeat editor. */
export function DuePicker({ item, onPicked }: DuePickerProps) {
  const today = useToday();
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const tomorrow = addDaysKey(today, 1);
  const nextWeek = nextWeekKey(today, weekStartsOn);
  const pick = (date: DateKey | null) => {
    setDue(item.id, date, item.dueTime);
    onPicked?.();
  };
  const selected = item.dueDate ? fromDateKey(item.dueDate) : undefined;

  return (
    <div className="due-picker w-[252px] space-y-2">
      <div>
        <QuickChoice
          icon={<Sun className="size-3.5" />}
          label="Today"
          hint={WEEKDAY_SHORT[weekdayOf(today)]}
          onClick={() => pick(today)}
        />
        <QuickChoice
          icon={<Sunrise className="size-3.5" />}
          label="Tomorrow"
          hint={WEEKDAY_SHORT[weekdayOf(tomorrow)]}
          onClick={() => pick(tomorrow)}
        />
        <QuickChoice
          icon={<ArrowRight className="size-3.5" />}
          label="Next week"
          hint={`${WEEKDAY_SHORT[weekdayOf(nextWeek)]} ${fromDateKey(nextWeek).getDate()}`}
          onClick={() => pick(nextWeek)}
        />
        {item.dueDate && (
          <QuickChoice
            icon={<CalendarX className="size-3.5" />}
            label="No date"
            onClick={() => pick(null)}
          />
        )}
      </div>
      <div className="border-t border-line pt-1">
        <DayPicker
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={weekStartsOn}
          showOutsideDays
          fixedWeeks
          onSelect={(date) => date && pick(toDateKey(date))}
        />
      </div>
      <div className="space-y-2 border-t border-line pt-2">
        <FieldRow label="Time" htmlFor="due-picker-time">
          <input
            id="due-picker-time"
            type="time"
            value={item.dueTime ?? ''}
            onChange={(e) => setDueTime(item.id, e.target.value || null)}
            className={clsx(inputClass, 'h-7 flex-1 text-xs')}
          />
          {item.dueTime && (
            <IconButton
              size="sm"
              label="Clear time"
              tooltip={false}
              icon={<X className="size-3.5" />}
              onClick={() => setDueTime(item.id, null)}
            />
          )}
        </FieldRow>
        <RepeatField item={item} />
      </div>
    </div>
  );
}
