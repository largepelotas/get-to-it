import { addDays, differenceInCalendarDays, format, isValid, parse } from 'date-fns';

/** Local calendar date as YYYY-MM-DD. */
export type DateKey = string;

export function toDateKey(date: Date): DateKey {
  return format(date, 'yyyy-MM-dd');
}

/** Local midnight of a date key. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value: unknown): value is DateKey {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parse(value, 'yyyy-MM-dd', new Date()))
  );
}

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function addDaysKey(key: DateKey, days: number): DateKey {
  return toDateKey(addDays(fromDateKey(key), days));
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return differenceInCalendarDays(fromDateKey(to), fromDateKey(from));
}

/** Combines a date key with HH:mm (local) into a timestamp. */
export function toTimestamp(key: DateKey, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = fromDateKey(key);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function toTimeString(date: Date): string {
  return format(date, 'HH:mm');
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "3:00 PM" or "15:00", following the system locale. */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return timeFormatter.format(d);
}

/**
 * A short, relative label for a date: Today, Tomorrow, Yesterday, a weekday
 * within the next week, otherwise "Mon, Oct 6" (with the year if it differs).
 */
export function formatDateKey(key: DateKey, now: Date = new Date()): string {
  const diff = daysBetween(todayKey(now), key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const date = fromDateKey(key);
  if (diff > 1 && diff < 7) return format(date, 'EEEE');
  if (date.getFullYear() !== now.getFullYear()) return format(date, 'EEE, MMM d, yyyy');
  return format(date, 'EEE, MMM d');
}

export function formatDue(
  dueDate: DateKey,
  dueTime: string | null,
  now: Date = new Date(),
): string {
  const day = formatDateKey(dueDate, now);
  return dueTime ? `${day} ${formatTime(dueTime)}` : day;
}

/** Long form for headings: "Wednesday, September 30". */
export function formatLongDate(key: DateKey, now: Date = new Date()): string {
  const date = fromDateKey(key);
  return date.getFullYear() === now.getFullYear()
    ? format(date, 'EEEE, MMMM d')
    : format(date, 'EEEE, MMMM d, yyyy');
}

export function formatTimestamp(ms: number, now: Date = new Date()): string {
  const d = new Date(ms);
  return `${formatDateKey(toDateKey(d), now)} ${timeFormatter.format(d)}`;
}

/** Overdue: the date has passed, or it's today and the set time has passed. */
export function isOverdue(
  dueDate: DateKey | null,
  dueTime: string | null,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  const today = todayKey(now);
  if (dueDate < today) return true;
  if (dueDate > today || !dueTime) return false;
  return toTimestamp(dueDate, dueTime) < now.getTime();
}

/** The first day of next week (Monday or Sunday, following the setting). */
export function nextWeekKey(today: DateKey, weekStartsOn: 0 | 1): DateKey {
  const weekday = fromDateKey(today).getDay();
  const daysLeft = (7 - weekday + weekStartsOn) % 7 || 7;
  return addDaysKey(today, daysLeft);
}

/** Milliseconds until the next local midnight. */
export function msUntilTomorrow(now: Date = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

/** "Sep 29", with the year when it isn't this year. */
export function formatShortDate(key: DateKey, now: Date = new Date()): string {
  const date = fromDateKey(key);
  return format(date, date.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}
