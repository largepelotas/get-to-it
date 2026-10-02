import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, List } from '@/data/types';
import { formatDateKey, formatDue, formatTime } from '@/lib/dates';
import { describeRow } from './describeRow';

const item = (fields: Partial<Item>): Item =>
  ({
    id: 'a',
    text: 'Task',
    checked: false,
    collapsed: false,
    details: null,
    dueDate: null,
    dueTime: null,
    endTime: null,
    deadline: null,
    priority: 0,
    recurrence: null,
    ...fields,
  }) as Item;

const row = (fields: Partial<Item>, childCount = 0, doneCount = 0) => ({
  item: item(fields),
  depth: 0,
  childCount,
  doneCount,
});

describe('describeRow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('says a task was closed as won’t do instead of completed', () => {
    expect(describeRow(row({ checked: true }))).toBe('Completed');
    expect(describeRow(row({ checked: true, wontDo: true }))).toBe("Won't do");
  });

  it('is empty for a plain task', () => {
    expect(describeRow(row({}))).toBe('');
  });

  it('puts everything the row shows into words', () => {
    const description = describeRow(
      row(
        {
          dueDate: '2026-10-02',
          dueTime: '15:00',
          priority: 1,
          details: '{"type":"doc"}',
          recurrence: { freq: 'daily', interval: 1, mode: 'schedule' } as Item['recurrence'],
          collapsed: true,
        },
        3,
        1,
      ),
      { hasReminder: true, origin: { list: { title: 'Work' } as List, parentText: 'Launch' } },
    );
    expect(description).toBe(
      `Due ${formatDue('2026-10-02', '15:00')}. Repeats every day. Priority 1. Reminder set. ` +
        '1 of 3 subtasks done, hidden. Has notes. In Work › Launch',
    );
  });

  it('says when a task is overdue, but not once it is done', () => {
    // Dates are formatted for the user's locale.
    const due = formatDue('2026-09-29', null);
    expect(describeRow(row({ dueDate: '2026-09-29' }))).toBe(`Due ${due}, overdue`);
    expect(describeRow(row({ dueDate: '2026-09-29', checked: true }))).toBe(
      `Completed. Due ${due}`,
    );
  });

  // Bug prevented: a screen reader hearing an en dash read out, or never hearing the end time.
  it('says a time range with the word "to"', () => {
    expect(describeRow(row({ dueDate: '2026-10-02', dueTime: '14:00', endTime: '15:30' }))).toBe(
      `Due Tomorrow ${formatTime('14:00')} to ${formatTime('15:30')}`,
    );
  });

  // Bug prevented: the deadline being invisible to a screen reader, or sorted after the repeat.
  it('says the deadline after the due part and before the repeat', () => {
    expect(
      describeRow(
        row({
          dueDate: '2026-10-02',
          deadline: '2026-10-10',
          recurrence: { freq: 'daily', interval: 1, mode: 'schedule' } as Item['recurrence'],
        }),
      ),
    ).toBe(`Due Tomorrow. Deadline ${formatDateKey('2026-10-10')}. Repeats every day`);
    expect(describeRow(row({ deadline: '2026-10-02' }))).toBe('Deadline Tomorrow');
  });

  // Bug prevented: a finished task being announced as past its deadline.
  it('says a deadline has passed, but not once the task is done', () => {
    expect(describeRow(row({ deadline: '2026-09-30' }))).toBe('Deadline Yesterday, passed');
    expect(describeRow(row({ deadline: '2026-10-01' }))).toBe('Deadline Today');
    expect(describeRow(row({ deadline: '2026-09-30', checked: true }))).toBe(
      'Completed. Deadline Yesterday',
    );
  });

  // Bug prevented: the timer icon on a row being invisible to a screen reader.
  it('says a focus timer is running, after the reminder', () => {
    expect(describeRow(row({}), { hasReminder: true, focusing: true })).toBe(
      'Reminder set. Focus timer running',
    );
    expect(describeRow(row({}), { focusing: false })).toBe('');
  });
});
