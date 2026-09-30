import { describe, expect, it } from 'vitest';
import type { Item, List, Reminder } from '@/data/types';
import { toTimestamp } from './dates';
import {
  describeReminder,
  fireKey,
  fireTime,
  formatOffset,
  inboxEntries,
  notificationFor,
  planSchedule,
  reminderEntries,
  reminderState,
  snoozeUntil,
} from './reminders';

const list = { id: 'l', title: 'Work', deletedAt: null, archivedAt: null } as List;

function item(patch: Partial<Item> = {}): Item {
  return {
    id: 'i',
    listId: 'l',
    text: 'Send report',
    checked: false,
    deletedAt: null,
    dueDate: '2026-10-05',
    dueTime: '15:00',
    ...patch,
  } as Item;
}

function reminder(patch: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r',
    itemId: 'i',
    kind: 'relative',
    offsetMinutes: 15,
    at: null,
    firedFor: null,
    dismissedFor: null,
    snoozedUntil: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const at = (date: string, time: string) => toTimestamp(date, time);

describe('fireTime', () => {
  it('counts back from the due time', () => {
    expect(fireTime(reminder(), item(), '09:00')).toBe(at('2026-10-05', '14:45'));
  });

  it('uses the all-day time for tasks without a time', () => {
    const r = reminder({ offsetMinutes: 1440 });
    expect(fireTime(r, item({ dueTime: null }), '08:30')).toBe(at('2026-10-04', '08:30'));
  });

  it('has no time for an undated task, unless the reminder is absolute', () => {
    expect(fireTime(reminder(), item({ dueDate: null, dueTime: null }), '09:00')).toBeNull();
    const absolute = reminder({ kind: 'absolute', offsetMinutes: null, at: 123 });
    expect(fireTime(absolute, item({ dueDate: null }), '09:00')).toBe(123);
  });

  it('moves with the due date of a repeating task', () => {
    const r = reminder();
    expect(fireTime(r, item({ dueDate: '2026-10-06' }), '09:00')).toBe(at('2026-10-06', '14:45'));
  });

  it('follows a snooze only while it is later than the set time', () => {
    const snoozed = reminder({ snoozedUntil: at('2026-10-05', '16:00') });
    expect(fireTime(snoozed, item(), '09:00')).toBe(at('2026-10-05', '16:00'));
    expect(fireTime(snoozed, item({ dueDate: '2026-10-12' }), '09:00')).toBe(
      at('2026-10-12', '14:45'),
    );
  });
});

describe('reminderState', () => {
  const t = 1000;
  it('is stored per fire time', () => {
    expect(reminderState(reminder(), t, 500)).toBe('scheduled');
    expect(reminderState(reminder(), t, 1000)).toBe('due');
    expect(reminderState(reminder({ firedFor: t }), t, 2000)).toBe('fired');
    expect(reminderState(reminder({ firedFor: t, dismissedFor: t }), t, 2000)).toBe('done');
    // Delivered for an earlier time: pending again.
    expect(reminderState(reminder({ firedFor: 400, dismissedFor: 400 }), t, 500)).toBe('scheduled');
  });
});

describe('reminderEntries', () => {
  const now = at('2026-10-05', '12:00');
  const tables = (items: Item[], reminders: Reminder[], lists: List[] = [list]) => ({
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    reminders: Object.fromEntries(reminders.map((r) => [r.id, r])),
    lists: Object.fromEntries(lists.map((l) => [l.id, l])),
  });

  it('skips finished, deleted and archived tasks', () => {
    const r = reminder();
    expect(reminderEntries(tables([item()], [r]), '09:00', now)).toHaveLength(1);
    expect(reminderEntries(tables([item({ checked: true })], [r]), '09:00', now)).toEqual([]);
    expect(reminderEntries(tables([item({ deletedAt: 1 })], [r]), '09:00', now)).toEqual([]);
    const archived = { ...list, archivedAt: 1 };
    expect(reminderEntries(tables([item()], [r], [archived]), '09:00', now)).toEqual([]);
    expect(reminderEntries(tables([], [r]), '09:00', now)).toEqual([]);
  });

  it('sorts soonest first; the inbox is newest first', () => {
    const rs = [
      reminder({ id: 'a', offsetMinutes: 0, firedFor: at('2026-10-05', '15:00') }),
      reminder({ id: 'b', offsetMinutes: 60, firedFor: at('2026-10-05', '14:00') }),
      reminder({ id: 'c', offsetMinutes: 30 }),
    ];
    const entries = reminderEntries(tables([item()], rs), '09:00', now);
    expect(entries.map((e) => e.reminder.id)).toEqual(['b', 'c', 'a']);
    expect(inboxEntries(entries).map((e) => e.reminder.id)).toEqual(['a', 'b']);
  });
});

describe('planSchedule', () => {
  const entry = (id: string, state: 'scheduled' | 'due' | 'fired' | 'done') => ({
    reminder: reminder({ id }),
    item: item(),
    list,
    at: 100,
    state,
  });
  const ids = (entries: { reminder: Reminder }[]) => entries.map((e) => e.reminder.id);

  it('sends future reminders and leaves delivered ones alone', () => {
    const plan = planSchedule([entry('a', 'scheduled'), entry('b', 'fired')], new Set(), false);
    expect(ids(plan.schedule)).toEqual(['a']);
    expect(plan.missed).toEqual([]);
  });

  it('treats past reminders as missed at launch', () => {
    const plan = planSchedule([entry('a', 'due')], new Set(), true);
    expect(ids(plan.missed)).toEqual(['a']);
  });

  it('keeps sending a reminder whose time just passed, and skips ones an edit moved into the past', () => {
    const plan = planSchedule(
      [entry('a', 'due'), entry('b', 'due')],
      new Set([fireKey('a', 100)]),
      false,
    );
    expect(ids(plan.schedule)).toEqual(['a']);
    expect(ids(plan.skipped)).toEqual(['b']);
  });
});

describe('text', () => {
  it('formats offsets', () => {
    expect(formatOffset(5)).toBe('5 minutes');
    expect(formatOffset(60)).toBe('1 hour');
    expect(formatOffset(90)).toBe('1 hour 30 minutes');
    expect(formatOffset(2880)).toBe('2 days');
    expect(formatOffset(10080)).toBe('1 week');
  });

  it('describes reminders', () => {
    expect(describeReminder(reminder({ offsetMinutes: 0 }), item())).toBe('At due time');
    expect(describeReminder(reminder({ offsetMinutes: 0 }), item({ dueTime: null }))).toBe(
      'On the day',
    );
    expect(describeReminder(reminder(), item())).toBe('15 minutes before');
  });

  it('builds the notification from the task and list', () => {
    const now = new Date(2026, 9, 5, 12);
    expect(notificationFor({ item: item(), list }, now).title).toBe('Send report');
    expect(notificationFor({ item: item(), list }, now).body).toMatch(/^Due Today .+ · Work$/);
    expect(notificationFor({ item: item({ dueDate: null }), list }, now).body).toBe('Work');
  });
});

describe('snoozeUntil', () => {
  const now = at('2026-10-05', '12:00');
  it('snoozes for a while or until tomorrow at the all-day time', () => {
    expect(snoozeUntil('10m', now, '09:00')).toBe(now + 10 * 60_000);
    expect(snoozeUntil('1h', now, '09:00')).toBe(now + 60 * 60_000);
    expect(snoozeUntil('tomorrow', now, '08:00')).toBe(at('2026-10-06', '08:00'));
  });
});
