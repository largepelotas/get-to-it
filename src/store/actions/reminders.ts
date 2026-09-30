import type { Reminder } from '@/data/types';
import { newId } from '@/lib/id';
import { fireTime, snoozeUntil, type SnoozeChoice } from '@/lib/reminders';
import { commit, useData } from '../data';
import type { Tx } from '../history';

export type ReminderSpec =
  { kind: 'relative'; offsetMinutes: number } | { kind: 'absolute'; at: number };

const allDayTime = () => useData.getState().settings.allDayReminderTime;

export function itemReminders(tx: Tx, itemId: string): Reminder[] {
  return tx.all('reminders').filter((r) => r.itemId === itemId);
}

/** Adds a reminder to a task. An identical one isn't added twice. Returns its id. */
export function addReminder(itemId: string, spec: ReminderSpec): string | null {
  const offset = spec.kind === 'relative' ? Math.max(0, Math.round(spec.offsetMinutes)) : null;
  const at = spec.kind === 'absolute' ? spec.at : null;
  if (at !== null && !Number.isFinite(at)) return null;
  return commit('Add reminder', (tx) => {
    if (!tx.get('items', itemId)) return null;
    const same = itemReminders(tx, itemId).find(
      (r) => r.kind === spec.kind && r.offsetMinutes === offset && r.at === at,
    );
    if (same) return same.id;
    const reminder: Reminder = {
      id: newId(),
      itemId,
      kind: spec.kind,
      offsetMinutes: offset,
      at,
      firedFor: null,
      dismissedFor: null,
      snoozedUntil: null,
      createdAt: tx.now,
      updatedAt: tx.now,
    };
    tx.put('reminders', reminder);
    return reminder.id;
  });
}

export function removeReminder(id: string): void {
  commit('Remove reminder', (tx) => tx.remove('reminders', id));
}

/**
 * Drops snoozes on a task's reminders. Called when its due date changes, so
 * a snooze from before doesn't hold back the reminder for the new date.
 */
export function clearSnoozes(tx: Tx, itemId: string): void {
  for (const r of itemReminders(tx, itemId)) {
    if (r.snoozedUntil !== null) tx.update('reminders', r.id, { snoozedUntil: null });
  }
}

/*
 * Delivering, snoozing and dismissing are bookkeeping rather than edits, so
 * they stay out of undo history.
 */

function currentFireTime(tx: Tx, reminder: Reminder): number | null {
  const item = tx.get('items', reminder.itemId);
  return item ? fireTime(reminder, item, allDayTime()) : null;
}

/** Records reminders as delivered for the given fire times (ignored if the time has since moved). */
export function markFired(fired: { id: string; at: number }[]): void {
  commit(
    'Reminder',
    (tx) => {
      for (const { id, at } of fired) {
        const r = tx.get('reminders', id);
        if (r && r.firedFor !== at && currentFireTime(tx, r) === at) {
          tx.update('reminders', id, { firedFor: at });
        }
      }
    },
    { undoable: false },
  );
}

/** Marks reminders done for the given fire times without delivering them. */
export function markSkipped(skipped: { id: string; at: number }[]): void {
  commit(
    'Reminder',
    (tx) => {
      for (const { id, at } of skipped) {
        const r = tx.get('reminders', id);
        if (r) tx.update('reminders', id, { firedFor: at, dismissedFor: at });
      }
    },
    { undoable: false },
  );
}

export function dismissReminders(ids: string[]): void {
  commit(
    'Dismiss reminder',
    (tx) => {
      for (const id of ids) {
        const r = tx.get('reminders', id);
        const at = r && currentFireTime(tx, r);
        if (r && at !== null && at !== undefined && r.dismissedFor !== at) {
          tx.update('reminders', id, { dismissedFor: at });
        }
      }
    },
    { undoable: false },
  );
}

/** Fires the reminder again later. Returns when. */
export function snoozeReminder(id: string, choice: SnoozeChoice): number {
  const until = snoozeUntil(choice, Date.now(), allDayTime());
  commit('Snooze reminder', (tx) => void tx.update('reminders', id, { snoozedUntil: until }), {
    undoable: false,
  });
  return until;
}
