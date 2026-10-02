import { addMonths, addYears, format, getDaysInMonth } from 'date-fns';
import type { Recurrence, Weekday } from '@/data/types';
import { addDaysKey, daysBetween, fromDateKey, toDateKey, type DateKey } from './dates';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WORKDAYS: Weekday[] = [1, 2, 3, 4, 5];

function weekdayOf(key: DateKey): Weekday {
  return fromDateKey(key).getDay() as Weekday;
}

/** Monday of the week containing `key`. Recurrence maths always uses Monday weeks. */
function mondayOf(key: DateKey): DateKey {
  const offset = (weekdayOf(key) + 6) % 7;
  return addDaysKey(key, -offset);
}

function sameDays(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && [...a].sort().every((d, i) => d === [...b].sort()[i]);
}

function monthlyOn(year: number, month: number, day: number): DateKey {
  const clamped = Math.min(day, getDaysInMonth(new Date(year, month, 1)));
  return toDateKey(new Date(year, month, clamped));
}

/** The first date in the rule's schedule (anchored at `anchor`) strictly after `after`. */
function occurrenceAfter(rule: Recurrence, anchor: DateKey, after: DateKey): DateKey {
  const interval = Math.max(1, Math.floor(rule.interval));
  switch (rule.freq) {
    case 'daily': {
      const diff = daysBetween(anchor, after);
      const steps = diff < 0 ? 0 : Math.floor(diff / interval) + 1;
      return addDaysKey(anchor, steps * interval);
    }
    case 'weekly': {
      const days = rule.weekdays?.length ? rule.weekdays : [weekdayOf(anchor)];
      const anchorWeek = mondayOf(anchor);
      let day = addDaysKey(after, 1);
      // A full cycle is at most `interval` weeks, so this always finds a date.
      for (let i = 0; i < 7 * interval + 7; i++) {
        const weeks = Math.round(daysBetween(anchorWeek, mondayOf(day)) / 7);
        if (weeks >= 0 && weeks % interval === 0 && days.includes(weekdayOf(day))) return day;
        day = addDaysKey(day, 1);
      }
      return addDaysKey(after, 7 * interval);
    }
    case 'monthly': {
      const start = fromDateKey(anchor);
      const dom = rule.day ?? start.getDate();
      for (let k = 0; ; k++) {
        const m = start.getMonth() + k * interval;
        const candidate = monthlyOn(start.getFullYear() + Math.floor(m / 12), m % 12, dom);
        if (candidate > after) return candidate;
      }
    }
    case 'yearly': {
      const start = fromDateKey(anchor);
      for (let k = 0; ; k++) {
        const candidate = monthlyOn(
          start.getFullYear() + k * interval,
          start.getMonth(),
          rule.day ?? start.getDate(),
        );
        if (candidate > after) return candidate;
      }
    }
  }
}

/** Adds one interval of the rule to a date (used for "after completion" rules). */
function addInterval(rule: Recurrence, from: DateKey): DateKey {
  const n = Math.max(1, Math.floor(rule.interval));
  const date = fromDateKey(from);
  switch (rule.freq) {
    case 'daily':
      return addDaysKey(from, n);
    case 'weekly':
      return addDaysKey(from, 7 * n);
    case 'monthly':
      return toDateKey(addMonths(date, n));
    case 'yearly':
      return toDateKey(addYears(date, n));
  }
}

const keepsDay = (rule: Recurrence) =>
  rule.mode === 'schedule' && (rule.freq === 'monthly' || rule.freq === 'yearly');

/**
 * The rule with the day of the month it's meant for written into it, taken from
 * the due date unless it's there already. Done before a task moves to its next
 * date: "monthly on the 31st" then lands on 28 February and goes back to the
 * 31st in March, instead of staying on the 28th.
 */
export function anchored(rule: Recurrence, dueDate: DateKey | null): Recurrence {
  if (!keepsDay(rule) || rule.day || !dueDate) return rule;
  return { ...rule, day: fromDateKey(dueDate).getDate() };
}

/** The rule without its noted day, for when the due date is moved by hand: the new date decides. */
export function unanchored(rule: Recurrence | null): Recurrence | null {
  if (!rule?.day) return rule;
  const { day: _day, ...rest } = rule;
  return rest;
}

/**
 * The next due date after finishing a recurring task.
 *
 * On a schedule, it's the next date in the schedule after both the current
 * due date and today, so finishing a late task doesn't leave it overdue.
 * After completion, it's one interval from today.
 */
export function nextDueDate(rule: Recurrence, dueDate: DateKey | null, today: DateKey): DateKey {
  if (rule.mode === 'completion') return addInterval(rule, today);
  const anchor = dueDate ?? today;
  const after = anchor > today ? anchor : today;
  return occurrenceAfter(rule, anchor, after);
}

/** The first date on or after `from` that fits the rule. Used when a repeat is added. */
export function firstOccurrence(rule: Recurrence, from: DateKey): DateKey {
  if (rule.mode === 'completion' || rule.freq !== 'weekly' || !rule.weekdays?.length) return from;
  if (rule.weekdays.includes(weekdayOf(from))) return from;
  return occurrenceAfter(rule, from, from);
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function listDays(days: Weekday[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** A human description such as "Every weekday" or "3 days after completion". */
export function describeRecurrence(rule: Recurrence, dueDate?: DateKey | null): string {
  const n = Math.max(1, Math.floor(rule.interval));
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  if (rule.mode === 'completion') {
    return `${n} ${unit}${n === 1 ? '' : 's'} after completion`;
  }
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  switch (rule.freq) {
    case 'daily':
      return every;
    case 'weekly': {
      const days = rule.weekdays?.length ? rule.weekdays : dueDate ? [weekdayOf(dueDate)] : [];
      if (n === 1 && sameDays(days, WORKDAYS)) return 'Every weekday';
      if (n === 1 && sameDays(days, [0, 6])) return 'Every weekend';
      if (n === 1 && days.length === 1) return `Every ${WEEKDAY_LONG[days[0]]}`;
      return days.length ? `${every} on ${listDays(days)}` : every;
    }
    case 'monthly':
      if (rule.day) return `${every} on the ${ordinal(rule.day)}`;
      return dueDate ? `${every} on the ${ordinal(fromDateKey(dueDate).getDate())}` : every;
    case 'yearly':
      return dueDate ? `${every} on ${format(fromDateKey(dueDate), 'MMM d')}` : every;
  }
}

export function sanitizeRecurrence(value: unknown): Recurrence | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Recurrence>;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(v.freq as string)) return null;
  const interval = Number(v.interval);
  const rule: Recurrence = {
    freq: v.freq as Recurrence['freq'],
    interval: Number.isFinite(interval) && interval >= 1 ? Math.floor(interval) : 1,
    mode: v.mode === 'completion' ? 'completion' : 'schedule',
  };
  if (Array.isArray(v.weekdays)) {
    const days = [...new Set(v.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (days.length) rule.weekdays = days as Weekday[];
  }
  const day = Number(v.day);
  if (keepsDay(rule) && Number.isInteger(day) && day >= 1 && day <= 31) rule.day = day;
  return rule;
}

/**
 * The date a skipped occurrence moves to: the first one after the current due
 * date that is also on or after `today`, so skipping an overdue task lands
 * on today or later. Counts from the due date even for "after I finish it"
 * rules. A task due in the future moves exactly one occurrence.
 */
export function skipDueDate(rule: Recurrence, dueDate: DateKey, today: DateKey = dueDate): DateKey {
  if (rule.mode === 'completion') {
    // Count each step from the due date itself, so a monthly rule on the
    // 31st doesn't slide to the 28th after passing February.
    const n = Math.max(1, Math.floor(rule.interval));
    let next = addInterval(rule, dueDate);
    for (let k = 2; next < today; k++) next = addInterval({ ...rule, interval: n * k }, dueDate);
    return next;
  }
  return occurrenceAfter(rule, dueDate, today > dueDate ? addDaysKey(today, -1) : dueDate);
}
