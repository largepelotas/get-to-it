import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, List } from '@/data/types';
import { formatDue } from '@/lib/dates';
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
});
