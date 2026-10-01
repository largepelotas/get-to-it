import type { Item, List, Reminder, Tables } from '@/data/types';
import { addDaysKey, formatDue, formatTimestamp, todayKey, toTimestamp } from './dates';

const MINUTE = 60_000;

/** A constant reminder notifies again this often while it waits in the inbox... */
export const REPEAT_EVERY = 5 * MINUTE;
/** ...for this long after its fire time. */
export const REPEAT_LIMIT = 2 * 60 * MINUTE;

/** A reminder to add: some minutes before the due moment, or at a fixed time (epoch ms). */
export type ReminderSpec =
  { kind: 'relative'; offsetMinutes: number } | { kind: 'absolute'; at: number };

/**
 * Where a reminder stands for its current fire time. Fired and dismissed
 * are stored per fire time, so when the time moves (a repeating task was
 * checked, the due date changed) the reminder is pending again by itself.
 */
export type ReminderState =
  /** In the future. */
  | 'scheduled'
  /** In the past and never delivered. */
  | 'due'
  /** Delivered and waiting in the inbox. */
  | 'fired'
  /** Dismissed. */
  | 'done';

/** A task a reminder can fire for: open, not deleted, in a list that's neither archived nor in the Trash. */
export function isRemindable(item: Item | undefined, list: List | undefined): item is Item {
  return (
    !!item && !item.deletedAt && !item.checked && !!list && !list.deletedAt && !list.archivedAt
  );
}

/** The due moment of a task: its date at its time, or at the all-day reminder time. */
export function dueMoment(item: Item, allDayTime: string): number | null {
  if (!item.dueDate) return null;
  return toTimestamp(item.dueDate, item.dueTime ?? allDayTime);
}

/** When the reminder is set for, ignoring any snooze. */
export function baseFireTime(reminder: Reminder, item: Item, allDayTime: string): number | null {
  if (reminder.kind === 'absolute') return reminder.at;
  const due = dueMoment(item, allDayTime);
  return due === null ? null : due - (reminder.offsetMinutes ?? 0) * MINUTE;
}

/** When the reminder fires: its set time, or a later snooze. */
export function fireTime(reminder: Reminder, item: Item, allDayTime: string): number | null {
  const base = baseFireTime(reminder, item, allDayTime);
  if (base === null) return null;
  return reminder.snoozedUntil !== null && reminder.snoozedUntil > base
    ? reminder.snoozedUntil
    : base;
}

export function reminderState(reminder: Reminder, at: number, now: number): ReminderState {
  if (reminder.dismissedFor === at) return 'done';
  if (reminder.firedFor === at) return 'fired';
  return at > now ? 'scheduled' : 'due';
}

export interface ReminderEntry {
  reminder: Reminder;
  item: Item;
  list: List;
  /** The fire time. */
  at: number;
  state: ReminderState;
}

/** Every reminder that has a fire time, soonest first. */
export function reminderEntries(
  tables: Pick<Tables, 'reminders' | 'items' | 'lists'>,
  allDayTime: string,
  now: number,
): ReminderEntry[] {
  const entries: ReminderEntry[] = [];
  for (const reminder of Object.values(tables.reminders)) {
    const item = tables.items[reminder.itemId];
    const list = item ? tables.lists[item.listId] : undefined;
    if (!isRemindable(item, list)) continue;
    const at = fireTime(reminder, item, allDayTime);
    if (at === null) continue;
    entries.push({ reminder, item, list: list!, at, state: reminderState(reminder, at, now) });
  }
  return entries.sort((a, b) => a.at - b.at || (a.reminder.id < b.reminder.id ? -1 : 1));
}

/** Delivered reminders that haven't been dismissed, newest first. */
export function inboxEntries(entries: ReminderEntry[]): ReminderEntry[] {
  return entries.filter((e) => e.state === 'fired').reverse();
}

/** Identifies one fire time of one reminder. */
export const fireKey = (id: string, at: number) => `${id}@${at}`;

export interface SchedulePlan {
  /** Hand these to the native scheduler. Past ones in here fire straight away. */
  schedule: ReminderEntry[];
  /** Passed while the app wasn't running: go to the inbox with a summary. */
  missed: ReminderEntry[];
  /**
   * Put in the past by an edit rather than by time passing (a due date moved
   * back, a task reopened or restored), so they're marked done without firing.
   */
  skipped: ReminderEntry[];
}

/**
 * Decides what to do with each reminder. `sent` holds the fire keys handed
 * to the scheduler last time: a past, undelivered reminder in there is one
 * the scheduler is firing right now, so it's sent again (the scheduler
 * ignores repeats of what it already fired). `launch` is the first plan
 * after the app starts, when past reminders were missed while it was closed.
 */
export function planSchedule(
  entries: ReminderEntry[],
  sent: ReadonlySet<string>,
  launch: boolean,
): SchedulePlan {
  const plan: SchedulePlan = { schedule: [], missed: [], skipped: [] };
  for (const entry of entries) {
    if (entry.state === 'scheduled') plan.schedule.push(entry);
    else if (entry.state !== 'due') continue;
    else if (launch) plan.missed.push(entry);
    else if (sent.has(fireKey(entry.reminder.id, entry.at))) plan.schedule.push(entry);
    else plan.skipped.push(entry);
  }
  return plan;
}

/**
 * When a delivered constant reminder should notify again: the first
 * `at + k × REPEAT_EVERY` (k ≥ 1) after `now`, or null once that would be
 * past `REPEAT_LIMIT`, or if the reminder isn't constant and waiting.
 */
export function nextRepeatAt(
  entry: Pick<ReminderEntry, 'reminder' | 'at' | 'state'>,
  now: number,
): number | null {
  if (!entry.reminder.constant || entry.state !== 'fired') return null;
  const k = Math.max(1, Math.floor((now - entry.at) / REPEAT_EVERY) + 1);
  const next = entry.at + k * REPEAT_EVERY;
  return next <= entry.at + REPEAT_LIMIT ? next : null;
}

/** The next time the daily review goes off: today at `time` if still ahead, else tomorrow. */
export function dailyReviewAt(time: string, now: number): number {
  const today = todayKey(new Date(now));
  const todays = toTimestamp(today, time);
  return todays > now ? todays : toTimestamp(addDaysKey(today, 1), time);
}

/** Notification text: the task, then when it's due and which list it's in. */
export function notificationFor(entry: Pick<ReminderEntry, 'item' | 'list'>, now = new Date()) {
  const { item, list } = entry;
  const due = item.dueDate ? `Due ${formatDue(item.dueDate, item.dueTime, now)}` : null;
  return { title: item.text, body: [due, list.title].filter(Boolean).join(' · ') };
}

export interface ReminderPreset {
  offsetMinutes: number;
  label: string;
}

/** Choices for a task with a due time. */
export const TIMED_PRESETS: ReminderPreset[] = [
  { offsetMinutes: 0, label: 'At due time' },
  { offsetMinutes: 5, label: '5 minutes before' },
  { offsetMinutes: 15, label: '15 minutes before' },
  { offsetMinutes: 30, label: '30 minutes before' },
  { offsetMinutes: 60, label: '1 hour before' },
  { offsetMinutes: 1440, label: '1 day before' },
];

/** Choices for an all-day task. They fire at the all-day reminder time. */
export const ALL_DAY_PRESETS: ReminderPreset[] = [
  { offsetMinutes: 0, label: 'On the day' },
  { offsetMinutes: 1440, label: '1 day before' },
  { offsetMinutes: 2880, label: '2 days before' },
  { offsetMinutes: 10080, label: '1 week before' },
];

export function presetsFor(item: Item): ReminderPreset[] {
  return item.dueTime ? TIMED_PRESETS : ALL_DAY_PRESETS;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "15 minutes", "1 hour", "2 days", "1 week", "1 hour 30 minutes". */
export function formatOffset(minutes: number): string {
  if (minutes >= 10080 && minutes % 10080 === 0) return plural(minutes / 10080, 'week');
  if (minutes >= 1440 && minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes >= 60 && minutes % 60 === 0) return plural(minutes / 60, 'hour');
  if (minutes > 60)
    return `${plural(Math.floor(minutes / 60), 'hour')} ${plural(minutes % 60, 'minute')}`;
  return plural(minutes, 'minute');
}

/** What the reminder is set to: "At due time", "15 minutes before", or a moment. */
export function describeReminder(reminder: Reminder, item: Item, now = new Date()): string {
  if (reminder.kind === 'absolute') return formatTimestamp(reminder.at ?? 0, now);
  const offset = reminder.offsetMinutes ?? 0;
  if (offset === 0) return item.dueTime ? 'At due time' : 'On the day';
  return `${formatOffset(offset)} before`;
}

export type SnoozeChoice = '10m' | '1h' | 'tomorrow';

export const SNOOZE_LABEL: Record<SnoozeChoice, string> = {
  '10m': '10 minutes',
  '1h': '1 hour',
  tomorrow: 'Tomorrow',
};

/** When a snooze ends: in 10 minutes, in an hour, or tomorrow at the all-day reminder time. */
export function snoozeUntil(choice: SnoozeChoice, now: number, allDayTime: string): number {
  if (choice === '10m') return now + 10 * MINUTE;
  if (choice === '1h') return now + 60 * MINUTE;
  return toTimestamp(addDaysKey(todayKey(new Date(now)), 1), allDayTime);
}
