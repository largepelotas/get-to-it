import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  startOfWeek,
} from 'date-fns';

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

/** The same day `months` months on (or back), clamped to the month's length: Jan 31 + 1 is Feb 28. */
export function addMonthsKey(key: DateKey, months: number): DateKey {
  return toDateKey(addMonths(fromDateKey(key), months));
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
  endTime: string | null = null,
): string {
  const day = formatDateKey(dueDate, now);
  if (!dueTime) return day;
  return `${day} ${formatTimeRange(dueTime, endTime)}`;
}

/** "2:00 PM" or "2:00 PM–3:30 PM" (an en dash, no spaces). */
export function formatTimeRange(start: string, end: string | null): string {
  return end ? `${formatTime(start)}\u2013${formatTime(end)}` : formatTime(start);
}

/** Minutes from midnight of an HH:mm time. */
export function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** The HH:mm time `minutes` after midnight (0 to 1439). */
export function timeOfMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** HH:mm plus `minutes`, or null if that would pass midnight or `minutes` isn't positive. */
export function addMinutes(time: string, minutes: number): string | null {
  if (!(minutes > 0)) return null;
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Whether HH:mm time `a` is strictly later than `b`. Zero-padded, so a string compare is enough. */
export function isTimeAfter(a: string, b: string): boolean {
  return a > b;
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

/** The first day of the week that holds `key` (Monday or Sunday, following the setting). */
export function startOfWeekKey(key: DateKey, weekStartsOn: 0 | 1): DateKey {
  return toDateKey(startOfWeek(fromDateKey(key), { weekStartsOn }));
}

/** The seven days of the week that holds `key`, first day first. */
export function weekDays(key: DateKey, weekStartsOn: 0 | 1): DateKey[] {
  const first = startOfWeekKey(key, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(first, i));
}

/** The day Upcoming starts from: the stored day, or today if there is none or it has passed. */
export function upcomingStart(upcomingFrom: DateKey | null, today: DateKey): DateKey {
  return upcomingFrom && upcomingFrom > today ? upcomingFrom : today;
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
