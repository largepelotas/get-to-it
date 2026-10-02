import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { toTimestamp } from '@/lib/dates';
import { fireTime } from '@/lib/reminders';
import { resetForTests, undo, useData } from '../data';
import { createItem, setChecked, setDue, setRecurrence } from './items';
import { createList } from './lists';
import {
  addReminder,
  dismissReminders,
  markFired,
  markSkipped,
  removeReminder,
  setReminderConstant,
  snoozeReminder,
} from './reminders';

let list: string;
let task: string;
const NOW = new Date(2026, 9, 5, 12, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
  task = createItem(list, { text: 'Report', dueDate: '2026-10-05', dueTime: '15:00' })!;
});

afterEach(() => vi.useRealTimers());

const reminders = () => Object.values(useData.getState().tables.reminders);
const get = (id: string) => useData.getState().tables.reminders[id];
const timeOf = (id: string) =>
  fireTime(
    get(id),
    useData.getState().tables.items[task],
    useData.getState().settings.allDayReminderTime,
  );

describe('adding and removing', () => {
  it('adds relative and absolute reminders, without duplicates', () => {
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 15 });
    expect(addReminder(task, { kind: 'relative', offsetMinutes: 15 })).toBe(a);
    addReminder(task, { kind: 'absolute', at: 123 });
    expect(reminders()).toHaveLength(2);
    expect(timeOf(a!)).toBe(toTimestamp('2026-10-05', '14:45'));
  });

  it('undoes adding and removing', () => {
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 0 })!;
    removeReminder(a);
    expect(reminders()).toHaveLength(0);
    undo();
    expect(get(a)).toBeDefined();
    undo();
    expect(reminders()).toHaveLength(0);
  });
});

/** What's stored for a dealt-with reminder counted from a due date: that date and time as UTC. */
const mark = (date: string, time: string) => Date.parse(`${date}T${time}:00Z`);

describe('bookkeeping', () => {
  it('records delivery only for the current fire time, outside undo history', () => {
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 0 })!;
    const past = useData.getState().past.length;
    markFired([{ id: a, at: 1 }]);
    expect(get(a).firedFor).toBeNull();
    markFired([{ id: a, at: timeOf(a)! }]);
    expect(get(a).firedFor).toBe(mark('2026-10-05', '15:00'));
    expect(useData.getState().past).toHaveLength(past);
  });

  it('dismisses and skips for the current fire time', () => {
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 0 })!;
    dismissReminders([a]);
    expect(get(a).dismissedFor).toBe(mark('2026-10-05', '15:00'));
    const b = addReminder(task, { kind: 'relative', offsetMinutes: 5 })!;
    markSkipped([{ id: b, at: 42 }]);
    const skipped = mark('2026-10-05', '14:55');
    expect(get(b)).toMatchObject({ firedFor: skipped, dismissedFor: skipped });
  });

  it('snoozes to a new fire time, which a due-date change clears', () => {
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 0 })!;
    const until = snoozeReminder(a, '1h');
    expect(until).toBe(NOW.getTime() + 3_600_000);
    expect(timeOf(a)).toBe(toTimestamp('2026-10-05', '15:00'));
    snoozeReminder(a, 'tomorrow');
    expect(timeOf(a)).toBe(toTimestamp('2026-10-06', '09:00'));
    setDue(task, '2026-10-05', '13:00');
    expect(get(a).snoozedUntil).toBeNull();
    expect(timeOf(a)).toBe(toTimestamp('2026-10-05', '13:00'));
  });

  it('comes back for the next date after completing a repeating task', () => {
    setRecurrence(task, { freq: 'daily', interval: 1, mode: 'schedule' });
    const a = addReminder(task, { kind: 'relative', offsetMinutes: 0 })!;
    const first = timeOf(a)!;
    markFired([{ id: a, at: first }]);
    dismissReminders([a]);
    setChecked(task, true);
    expect(timeOf(a)).toBe(first + 86_400_000);
    expect(get(a).dismissedFor).toBe(mark('2026-10-05', '15:00'));
  });
});

describe('constant reminders', () => {
  // Bug prevented: adding the same preset again quietly creating a second, ordinary copy.
  it('are not added twice by an identical one, and keep their setting', () => {
    const r = addReminder(task, { kind: 'relative', offsetMinutes: 15 })!;
    setReminderConstant(r, true);
    expect(addReminder(task, { kind: 'relative', offsetMinutes: 15 })).toBe(r);
    expect(reminders()).toHaveLength(1);
    expect(get(r).constant).toBe(true);
  });

  it('start out ordinary, and switching on is one undo step', () => {
    const r = addReminder(task, { kind: 'relative', offsetMinutes: 15 })!;
    expect(get(r).constant).toBe(false);
    setReminderConstant(r, true);
    undo();
    expect(get(r).constant).toBe(false);
  });
});
