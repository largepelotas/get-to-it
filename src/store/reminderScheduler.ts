import { todayKey } from '@/lib/dates';
import {
  dailyReviewAt,
  fireKey,
  nextRepeatAt,
  notificationFor,
  planSchedule,
  reminderEntries,
  type ReminderEntry,
} from '@/lib/reminders';
import type { ScheduledReminder } from '@/platform';
import { markFired, markSkipped } from './actions/reminders';
import { useData } from './data';
import { useFocus } from './focus';
import { endsAt } from '@/lib/focus';
import { dueRows, todayModel } from './smart';

/** Id of the daily review's notification. */
export const DAILY_REVIEW_ID = 'daily-review';
/** Id of the focus timer's end-of-countdown notification. */
export const FOCUS_END_ID = 'focus-end';
/** Added to a reminder's id for its repeat notification. */
const AGAIN = ':again';

/** "3 tasks due today · 2 overdue", "1 task due today", "Nothing due today". */
function reviewBody(date: string): string {
  const { items, lists } = useData.getState().tables;
  const { overdue, today } = todayModel(dueRows(items, lists), date);
  const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`;
  if (!overdue.length && !today.length) return 'Nothing due today';
  return [
    today.length ? `${plural(today.length)} due today` : null,
    overdue.length ? `${overdue.length} overdue` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface SchedulerDeps {
  /** Replaces what the native (or browser) scheduler will fire. */
  setSchedule: (entries: ScheduledReminder[]) => void | Promise<void>;
  /** Subscribes to fired reminders; returns an unsubscribe function. */
  onFired: (handler: (fired: { id: string; at: number }) => void) => () => void;
  /** Reminders that passed while the app was closed. They're already in the inbox. */
  onMissed: (entries: ReminderEntry[]) => void;
  /** The daily review went off while the app was running. */
  onDailyReview?: () => void;
  /** The focus timer's countdown reached zero while the app was running. */
  onFocusEnd?: () => void;
  now?: () => number;
}

const toFired = (e: ReminderEntry) => ({ id: e.reminder.id, at: e.at });

/**
 * Keeps the scheduler in step with the data: whenever tasks, reminders or
 * the all-day time or daily review time change, it sends every upcoming fire time again, and it
 * records reminders as delivered when they fire. The first pass after
 * starting collects reminders missed while the app was closed. Returns a
 * function that stops it.
 */
export function startReminderScheduler(deps: SchedulerDeps): () => void {
  const now = deps.now ?? Date.now;
  let sent = new Set<string>();
  let launch = true;
  let running = false;
  let again = false;
  // The latest time the platform reported firing something. A timer that fires a
  // hair early must not make the next pass queue the same moment again.
  let firedFloor = 0;

  /** One pass. Returns true if it changed data, so another pass is needed. */
  const pass = (): boolean => {
    const { tables, settings } = useData.getState();
    const all = reminderEntries(tables, settings.allDayReminderTime, now());
    const plan = planSchedule(all, sent, launch);
    launch = false;
    if (plan.missed.length || plan.skipped.length) {
      if (plan.skipped.length) markSkipped(plan.skipped.map(toFired));
      if (plan.missed.length) {
        markFired(plan.missed.map(toFired));
        deps.onMissed(plan.missed);
      }
      return true;
    }
    sent = new Set(plan.schedule.map((e) => fireKey(e.reminder.id, e.at)));
    const entries: ScheduledReminder[] = plan.schedule.map((e) => ({
      id: e.reminder.id,
      at: e.at,
      ...notificationFor(e),
    }));
    // Constant reminders waiting in the inbox: one more notification at the next slot.
    const clock = Math.max(now(), firedFloor);
    for (const e of all) {
      const next = nextRepeatAt(e, clock);
      if (next === null) continue;
      const { title, body } = notificationFor(e);
      entries.push({ id: e.reminder.id + AGAIN, at: next, title, body: `Still waiting · ${body}` });
    }
    if (settings.dailyReviewTime) {
      const at = dailyReviewAt(settings.dailyReviewTime, clock);
      entries.push({
        id: DAILY_REVIEW_ID,
        at,
        title: 'Plan your day',
        body: reviewBody(todayKey(new Date(at))),
      });
    }
    const { timer } = useFocus.getState();
    const focusEnd = timer ? endsAt(timer) : null;
    if (timer && focusEnd !== null) {
      if (timer.kind === 'break') {
        entries.push({ id: FOCUS_END_ID, at: focusEnd, title: 'Break over', body: 'Back to it' });
      } else {
        const text = timer.itemId ? tables.items[timer.itemId]?.text : undefined;
        entries.push({
          id: FOCUS_END_ID,
          at: focusEnd,
          title: 'Focus done',
          body: `${timer.minutes} min on “${text ?? ''}”`,
        });
      }
    }
    void Promise.resolve(deps.setSchedule(entries)).catch((err: unknown) =>
      console.error('Could not schedule reminders', err),
    );
    return false;
  };

  const sync = () => {
    // Marking reminders changes the store, which calls back in here.
    if (running) return void (again = true);
    running = true;
    try {
      for (let guard = 0; guard < 5; guard++) {
        again = false;
        if (!pass() && !again) break;
      }
    } finally {
      running = false;
    }
  };

  const unsubscribe = useData.subscribe((state, prev) => {
    if (
      state.tables.items !== prev.tables.items ||
      state.tables.reminders !== prev.tables.reminders ||
      state.tables.lists !== prev.tables.lists ||
      state.settings.allDayReminderTime !== prev.settings.allDayReminderTime ||
      state.settings.dailyReviewTime !== prev.settings.dailyReviewTime
    ) {
      sync();
    }
  });
  const unsubscribeFocus = useFocus.subscribe((state, prev) => {
    if (state.timer !== prev.timer) sync();
  });
  const stopListening = deps.onFired((fired) => {
    firedFloor = Math.max(firedFloor, fired.at);
    if (fired.id === DAILY_REVIEW_ID) {
      deps.onDailyReview?.();
      sync();
    } else if (fired.id === FOCUS_END_ID) {
      deps.onFocusEnd?.();
      sync();
    } else if (fired.id.endsWith(AGAIN)) {
      // A repeat isn't a new delivery: nothing is stored, but the next one needs queueing.
      sync();
    } else markFired([fired]);
  });
  sync();

  return () => {
    unsubscribe();
    unsubscribeFocus();
    stopListening();
    void Promise.resolve(deps.setSchedule([])).catch(() => {});
  };
}
