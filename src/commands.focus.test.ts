import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { closeAsWontDo, toggleItem, toggleItems, trashItems } from './commands';
import { createItem } from './store/actions/items';
import { createList } from './store/actions/lists';
import { resetForTests, useData } from './store/data';
import { startTimer, useFocus } from './store/focus';

const T0 = new Date(2026, 9, 5, 12, 0).getTime();
let list: string;
let task: string;
let other: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  resetForTests(new MemoryRepository());
  useFocus.setState({ timer: null });
  list = createList({ type: 'todo', title: 'Tasks' });
  task = createItem(list, { text: 'Write plan' })!;
  other = createItem(list, { text: 'Other' })!;
  startTimer('stopwatch', task, null, T0);
  // Two minutes of work, then the command runs.
  vi.setSystemTime(T0 + 120_000);
});

afterEach(() => vi.useRealTimers());

const sessions = () => Object.values(useData.getState().tables.focusSessions);

// Bug prevented: finishing or deleting a task leaving its timer running, so the time is never
// logged (or is logged against a task that is gone).
describe('commands that end a task stop its timer', () => {
  it('completing one task logs the time', () => {
    toggleItem(task, true);
    expect(useFocus.getState().timer).toBeNull();
    expect(sessions()).toMatchObject([{ itemId: task, seconds: 120 }]);
  });

  it('completing several tasks logs the time', () => {
    toggleItems([task, other]);
    expect(useFocus.getState().timer).toBeNull();
    expect(sessions()).toMatchObject([{ itemId: task, seconds: 120 }]);
  });

  it('deleting the task logs the time', () => {
    trashItems([task]);
    expect(useFocus.getState().timer).toBeNull();
    expect(sessions()).toHaveLength(1);
  });

  it('closing as won’t do logs the time', () => {
    closeAsWontDo(task);
    expect(useFocus.getState().timer).toBeNull();
    expect(sessions()).toHaveLength(1);
  });

  // Bug prevented: an unrelated task's command stopping the timer.
  it('leaves the timer alone for another task', () => {
    toggleItem(other, true);
    trashItems([other]);
    expect(useFocus.getState().timer).not.toBeNull();
    expect(sessions()).toHaveLength(0);
  });
});
