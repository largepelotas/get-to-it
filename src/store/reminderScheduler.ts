import {
  fireKey,
  notificationFor,
  planSchedule,
  reminderEntries,
  type ReminderEntry,
} from '@/lib/reminders';
import type { ScheduledReminder } from '@/platform';
import { markFired, markSkipped } from './actions/reminders';
import { useData } from './data';

export interface SchedulerDeps {
  /** Replaces what the native (or browser) scheduler will fire. */
  setSchedule: (entries: ScheduledReminder[]) => void | Promise<void>;
  /** Subscribes to fired reminders; returns an unsubscribe function. */
  onFired: (handler: (fired: { id: string; at: number }) => void) => () => void;
  /** Reminders that passed while the app was closed. They're already in the inbox. */
  onMissed: (entries: ReminderEntry[]) => void;
  now?: () => number;
}

const toFired = (e: ReminderEntry) => ({ id: e.reminder.id, at: e.at });

/**
 * Keeps the scheduler in step with the data: whenever tasks, reminders or
 * the all-day time change, it sends every upcoming fire time again, and it
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

  /** One pass. Returns true if it changed data, so another pass is needed. */
  const pass = (): boolean => {
    const { tables, settings } = useData.getState();
    const plan = planSchedule(
      reminderEntries(tables, settings.allDayReminderTime, now()),
      sent,
      launch,
    );
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
    const entries = plan.schedule.map((e) => ({
      id: e.reminder.id,
      at: e.at,
      ...notificationFor(e),
    }));
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
      state.settings.allDayReminderTime !== prev.settings.allDayReminderTime
    ) {
      sync();
    }
  });
  const stopListening = deps.onFired((fired) => markFired([fired]));
  sync();

  return () => {
    unsubscribe();
    stopListening();
    void Promise.resolve(deps.setSchedule([])).catch(() => {});
  };
}
