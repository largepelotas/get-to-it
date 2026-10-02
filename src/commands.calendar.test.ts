import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, formatTime, todayKey } from '@/lib/dates';
import { moveTasksToDay, moveTaskToTime } from './commands';
import { createItem } from './store/actions/items';
import { createList } from './store/actions/lists';
import { resetForTests, useData } from './store/data';

vi.mock('sonner', () => ({ toast: vi.fn() }));

const today = todayKey();
const tomorrow = addDaysKey(today, 1);
let list: string;
const item = (id: string) => useData.getState().tables.items[id];
const past = () => useData.getState().past.length;

beforeEach(() => {
  vi.mocked(toast).mockClear();
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

// Bug prevented: dragging an undated task onto a calendar day doing nothing (the old
// reschedule only moved tasks that already had a date).
describe('moveTasksToDay', () => {
  it('gives an undated task the date, with a toast', () => {
    const id = createItem(list, { text: 'A' })!;
    moveTasksToDay([id], tomorrow);
    expect(item(id).dueDate).toBe(tomorrow);
    expect(toast).toHaveBeenCalledWith('Moved to Tomorrow', expect.anything());
  });

  it('keeps the time of a dated task', () => {
    const id = createItem(list, { text: 'A', dueDate: today, dueTime: '09:30' })!;
    moveTasksToDay([id], tomorrow);
    expect(item(id)).toMatchObject({ dueDate: tomorrow, dueTime: '09:30' });
  });

  it('does nothing for tasks already on the day', () => {
    const id = createItem(list, { text: 'A', dueDate: tomorrow })!;
    const before = past();
    moveTasksToDay([id], tomorrow);
    expect(past()).toBe(before);
    expect(toast).not.toHaveBeenCalled();
  });

  // Bug prevented: a multi-task drop needing one Undo per task.
  it('moves several tasks as one undo step and counts them', () => {
    const a = createItem(list, { text: 'A' })!;
    const b = createItem(list, { text: 'B', dueDate: today })!;
    const c = createItem(list, { text: 'C', dueDate: tomorrow })!;
    const before = past();
    moveTasksToDay([a, b, c], tomorrow);
    expect(past()).toBe(before + 1);
    expect([a, b, c].map((id) => item(id).dueDate)).toEqual([tomorrow, tomorrow, tomorrow]);
    expect(toast).toHaveBeenCalledWith('Moved 2 tasks to Tomorrow', expect.anything());
  });
});

describe('moveTaskToTime', () => {
  // Bug prevented: a time-grid drop changing the date but not the time (or the reverse).
  it('sets the date and time, with a toast naming both', () => {
    const id = createItem(list, { text: 'A', dueDate: today, dueTime: '14:00', endTime: '15:00' })!;
    moveTaskToTime(id, tomorrow, '09:15');
    expect(item(id)).toMatchObject({ dueDate: tomorrow, dueTime: '09:15', endTime: '10:15' });
    expect(toast).toHaveBeenCalledWith(
      `Moved to Tomorrow ${formatTime('09:15')}`,
      expect.anything(),
    );
  });

  // Bug prevented: a drop on the all-day row keeping the old time.
  it('clears the time for null, and says only the day', () => {
    const id = createItem(list, { text: 'A', dueDate: today, dueTime: '14:00' })!;
    moveTaskToTime(id, tomorrow, null);
    expect(item(id)).toMatchObject({ dueDate: tomorrow, dueTime: null });
    expect(toast).toHaveBeenCalledWith('Moved to Tomorrow', expect.anything());
  });

  // Bug prevented: a drop where the block already is adding an undo step and a toast.
  it('does nothing when the date and time are unchanged', () => {
    const id = createItem(list, { text: 'A', dueDate: today, dueTime: '14:00' })!;
    const plain = createItem(list, { text: 'B', dueDate: today })!;
    const before = past();
    moveTaskToTime(id, today, '14:00');
    moveTaskToTime(plain, today, null);
    expect(past()).toBe(before);
    expect(toast).not.toHaveBeenCalled();
  });
});
