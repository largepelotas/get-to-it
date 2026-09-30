import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Reminder } from '@/data/types';
import { toTimestamp } from '@/lib/dates';
import type { ScheduledReminder } from '@/platform';
import { createItem, setDue } from './actions/items';
import { createList } from './actions/lists';
import { addReminder } from './actions/reminders';
import { flushWrites, resetForTests, useData } from './data';
import { startReminderScheduler } from './reminderScheduler';

let repo: MemoryRepository;
let list: string;
let now: number;
let schedules: ScheduledReminder[][];
let fire: (fired: { id: string; at: number }) => void;
let missed: string[][];
let stop: (() => void) | null = null;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
  list = createList({ type: 'todo', title: 'Work' });
  now = toTimestamp('2026-10-05', '12:00');
  schedules = [];
  missed = [];
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
