import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Reminder } from '@/data/types';
import { toTimestamp } from '@/lib/dates';
import type { ScheduledReminder } from '@/platform';
import { createItem, setChecked, setDue } from './actions/items';
import { createList } from './actions/lists';
import { addReminder, dismissReminders, setReminderConstant } from './actions/reminders';
import { commit, flushWrites, resetForTests, setSetting, useData } from './data';
import { startReminderScheduler } from './reminderScheduler';

let repo: MemoryRepository;
let list: string;
let now: number;
let schedules: ScheduledReminder[][];
let fire: (fired: { id: string; at: number }) => void;
let missed: string[][];
let reviews: number;
let stop: (() => void) | null = null;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
  list = createList({ type: 'todo', title: 'Work' });
  now = toTimestamp('2026-10-05', '12:00');
  schedules = [];
  missed = [];
  reviews = 0;
});

afterEach(() => stop?.());

function start() {
  stop = startReminderScheduler({
    setSchedule: (entries) => void schedules.push(entries),
    onFired: (handler) => {
      fire = handler;
      return () => {};
    },
    onMissed: (entries) => missed.push(entries.map((e) => e.item.text)),
    onDailyReview: () => void reviews++,
    now: () => now,
  });
}

const lastSchedule = () => schedules[schedules.length - 1].map((e) => e.title);
const reminder = (id: string): Reminder => useData.getState().tables.reminders[id];

function task(text: string, dueTime: string, offsetMinutes = 0) {
  const id = createItem(list, { text, dueDate: '2026-10-05', dueTime })!;
  const r = addReminder(id, { kind: 'relative', offsetMinutes })!;
  return { id, r };
}

describe('reminder scheduler', () => {
  it('schedules upcoming reminders and reports missed ones at launch', () => {
    const late = task('Standup', '09:30');
    task('Review', '15:00');
    task('Lunch', '10:00');
    start();
    expect(lastSchedule()).toEqual(['Review']);
    expect(schedules[schedules.length - 1][0]).toMatchObject({
      at: toTimestamp('2026-10-05', '15:00'),
    });
    expect(missed).toEqual([['Standup', 'Lunch']]);
    // Missed reminders go to the inbox.
    expect(reminder(late.r).firedFor).toBe(toTimestamp('2026-10-05', '09:30'));
  });

  it('reschedules when data changes and records fired reminders', () => {
    start();
    const t = task('Review', '15:00', 15);
    expect(lastSchedule()).toEqual(['Review']);
    now = toTimestamp('2026-10-05', '14:45');
    fire({ id: t.r, at: now });
    expect(reminder(t.r).firedFor).toBe(now);
    expect(lastSchedule()).toEqual([]);
  });

  it('keeps sending a reminder whose time passed until it has fired', () => {
    start();
    task('Review', '15:00');
    now = toTimestamp('2026-10-05', '15:00') + 500;
    task('Other', '18:00');
    expect(lastSchedule()).toEqual(['Review', 'Other']);
  });

  it('skips reminders an edit moved into the past, without reporting them', async () => {
    start();
    const t = task('Review', '15:00');
    setDue(t.id, '2026-10-05', '11:00');
    expect(lastSchedule()).toEqual([]);
    expect(missed).toEqual([]);
    expect(reminder(t.r).dismissedFor).toBe(toTimestamp('2026-10-05', '11:00'));
    await flushWrites();
    const saved = (await repo.load()).tables.reminders[t.r];
    expect(saved.dismissedFor).toBe(toTimestamp('2026-10-05', '11:00'));
  });

  it('sends nothing once stopped', () => {
    task('Review', '15:00');
    start();
    stop!();
    stop = null;
    expect(lastSchedule()).toEqual([]);
  });
});

const MIN = 60_000;
const lastEntries = () => schedules[schedules.length - 1];

describe('constant reminders', () => {
  /** A constant reminder for a 15:00 task, delivered at 15:00, with the clock a little after. */
  function delivered() {
    const t = task('Review', '15:00');
    setReminderConstant(t.r, true);
    start();
    const at = toTimestamp('2026-10-05', '15:00');
    now = at + 1000;
    fire({ id: t.r, at });
    return { ...t, at };
  }

  // Bug prevented: a "constant" reminder going off once and then going quiet.
  it('queues a repeat at the next 5-minute slot once delivered', () => {
    const t = delivered();
    expect(lastEntries()).toEqual([
      {
        id: `${t.r}:again`,
        at: t.at + 5 * MIN,
        title: 'Review',
        body: expect.stringMatching(/^Still waiting · /),
      },
    ]);
  });

  // Bug prevented: the repeat being recorded as a new delivery, or never queueing the next one.
  it('queues the next repeat when one fires, without changing stored data', () => {
    const t = delivered();
    const before = useData.getState().tables;
    now = t.at + 5 * MIN + 500;
    fire({ id: `${t.r}:again`, at: t.at + 5 * MIN });
    expect(lastEntries().map((e) => [e.id, e.at])).toEqual([[`${t.r}:again`, t.at + 10 * MIN]]);
    expect(useData.getState().tables).toBe(before);
  });

  it('stops repeating after two hours', () => {
    const t = delivered();
    now = t.at + 120 * MIN + 500;
    fire({ id: `${t.r}:again`, at: t.at + 120 * MIN });
    expect(lastEntries()).toEqual([]);
  });

  // Bug prevented: a reminder you dealt with keeps buzzing.
  it('stops when dismissed, snoozed, completed or switched off', () => {
    let t = delivered();
    dismissReminders([t.r]);
    expect(lastEntries()).toEqual([]);
    stop!();
    stop = null;

    resetForTests(new MemoryRepository());
    list = createList({ type: 'todo', title: 'Work' });
    schedules = [];
    t = delivered();
    // (snoozeReminder uses the real clock, which is behind this test's pretend one.)
    commit('Snooze', (tx) => void tx.update('reminders', t.r, { snoozedUntil: t.at + 60 * MIN }));
    expect(lastEntries().map((e) => e.id)).toEqual([t.r]);
    stop!();
    stop = null;

    resetForTests(new MemoryRepository());
    list = createList({ type: 'todo', title: 'Work' });
    schedules = [];
    t = delivered();
    setChecked(t.id, true);
    expect(lastEntries()).toEqual([]);
    stop!();
    stop = null;

    resetForTests(new MemoryRepository());
    list = createList({ type: 'todo', title: 'Work' });
    schedules = [];
    t = delivered();
    setReminderConstant(t.r, false);
    expect(lastEntries()).toEqual([]);
  });

  // Bug prevented: ordinary reminders picking up repeats.
  it('leaves ordinary reminders alone', () => {
    start();
    const t = task('Review', '15:00');
    const at = toTimestamp('2026-10-05', '15:00');
    now = at + 1000;
    fire({ id: t.r, at });
    expect(lastEntries()).toEqual([]);
  });

  it('repeats from the next slot for one missed while the app was closed', () => {
    const t = task('Review', '11:00');
    setReminderConstant(t.r, true);
    now = toTimestamp('2026-10-05', '11:00') + 7 * MIN;
    start();
    expect(missed).toEqual([['Review']]);
    expect(lastEntries().map((e) => e.at)).toEqual([toTimestamp('2026-10-05', '11:10')]);
  });
});

describe('daily review', () => {
  const at = (date: string, time: string) => toTimestamp(date, time);

  it('is queued for today while the time is ahead, else tomorrow', () => {
    setSetting('dailyReviewTime', '13:00');
    start();
    expect(lastEntries()).toMatchObject([
      { id: 'daily-review', at: at('2026-10-05', '13:00'), title: 'Plan your day' },
    ]);
    setSetting('dailyReviewTime', '09:00');
    expect(lastEntries()[0].at).toBe(at('2026-10-06', '09:00'));
  });

  it('is not queued when off, and goes away when switched off', () => {
    start();
    expect(lastEntries()).toEqual([]);
    setSetting('dailyReviewTime', '13:00');
    expect(lastEntries()).toHaveLength(1);
    setSetting('dailyReviewTime', null);
    expect(lastEntries()).toEqual([]);
  });

  // Bug prevented: the review going off once and never again.
  it('queues the next one when it fires, tells the app, and marks nothing', () => {
    setSetting('dailyReviewTime', '13:00');
    start();
    const before = useData.getState().tables;
    now = at('2026-10-05', '13:00') + 500;
    fire({ id: 'daily-review', at: at('2026-10-05', '13:00') });
    expect(reviews).toBe(1);
    expect(lastEntries()[0]).toMatchObject({ id: 'daily-review', at: at('2026-10-06', '13:00') });
    expect(useData.getState().tables).toBe(before);
  });

  it('says what is due, for the day it goes off on', () => {
    setSetting('dailyReviewTime', '13:00');
    start();
    expect(lastEntries()[0].body).toBe('Nothing due today');
    createItem(list, { text: 'A', dueDate: '2026-10-05' });
    expect(lastEntries()[0].body).toBe('1 task due today');
    createItem(list, { text: 'B', dueDate: '2026-10-05' });
    createItem(list, { text: 'C', dueDate: '2026-10-01' });
    createItem(list, { text: 'D', dueDate: '2026-10-06' });
    expect(lastEntries()[0].body).toBe('2 tasks due today · 1 overdue');
    // Past the time, it's tomorrow's review: tomorrow's tasks, with today's now overdue.
    now = at('2026-10-05', '14:00');
    createItem(list, { text: 'E', dueDate: '2026-10-06' });
    expect(lastEntries()[0].body).toBe('2 tasks due today · 3 overdue');
  });
});
