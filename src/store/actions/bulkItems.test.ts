import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, todayKey } from '@/lib/dates';
import { resetForTests, undo, useData } from '../data';
import {
  createItem,
  deleteItems,
  moveItemsToList,
  setCheckedMany,
  setDueDates,
  setPriorities,
  type NewItem,
} from './items';
import { createList } from './lists';

let list: string;
let other: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
  other = createList({ type: 'todo', title: 'Other' });
});

const items = () => useData.getState().tables.items;
const item = (id: string) => items()[id];
const add = (text: string, extra: Partial<NewItem> = {}) => createItem(list, { text, ...extra })!;
const steps = () => useData.getState().past.length;

describe('changing several tasks at once', () => {
  // Bug it prevents: looping the single-task action made one undo step per task, so
  // Undo on the toast brought back only the last one.
  it('sets priority on all of them as one undo step', () => {
    const a = add('A');
    const b = add('B', { priority: 2 });
    const c = add('C');
    const before = steps();
    setPriorities([a, b, c], 1);
    expect([a, b, c].map((id) => item(id).priority)).toEqual([1, 1, 1]);
    expect(steps()).toBe(before + 1);
    undo();
    expect([a, b, c].map((id) => item(id).priority)).toEqual([0, 2, 0]);
  });

  // Bug it prevents: picking "Tomorrow" for several tasks wiped their times of day.
  it('sets a date on all of them, keeping each time, in one undo step', () => {
    const tomorrow = addDaysKey(todayKey(), 1);
    const a = add('A', { dueDate: todayKey(), dueTime: '09:30' });
    const b = add('B');
    const before = steps();
    setDueDates([a, b], tomorrow);
    expect(item(a)).toMatchObject({ dueDate: tomorrow, dueTime: '09:30' });
    expect(item(b)).toMatchObject({ dueDate: tomorrow, dueTime: null });
    expect(steps()).toBe(before + 1);
    undo();
    expect(item(a).dueDate).toBe(todayKey());
    expect(item(b).dueDate).toBeNull();
  });

  // Bug it prevents: "No date" left a repeat rule behind with nothing to count from.
  it('clears date, time and repeat with "No date"', () => {
    const a = add('A', {
      dueDate: todayKey(),
      dueTime: '09:30',
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    });
    const b = add('B', { dueDate: todayKey() });
    setDueDates([a, b], null);
    expect(item(a)).toMatchObject({ dueDate: null, dueTime: null, recurrence: null });
    expect(item(b).dueDate).toBeNull();
  });

  // Bug it prevents: completing several made one undo step each.
  it('completes and reopens several as one step each', () => {
    const a = add('A');
    const b = add('B');
    const sub = add('Sub', { parentId: b });
    const before = steps();
    setCheckedMany([a, b], true);
    expect([a, b, sub].map((id) => item(id).checked)).toEqual([true, true, true]);
    expect(steps()).toBe(before + 1);
    setCheckedMany([a, b], false);
    expect([a, b].map((id) => item(id).checked)).toEqual([false, false]);
    expect(steps()).toBe(before + 2);
    undo();
    expect(item(a).checked).toBe(true);
  });

  // Bug it prevents: a repeating task in a bulk completion was closed instead of moved on.
  it('moves a repeating task to its next date when completing several', () => {
    const a = add('A');
    const r = add('R', {
      dueDate: todayKey(),
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    });
    setCheckedMany([a, r], true);
    expect(item(a).checked).toBe(true);
    expect(item(r).checked).toBe(false);
    expect(item(r).dueDate).toBe(addDaysKey(todayKey(), 1));
  });

  // Bug it prevents: moving several made N undo steps, or moved a subtask away from a
  // parent that was moving too (tearing the subtree apart).
  it('moves tasks to another list as one step, with a selected parent taking its subtask', () => {
    const a = add('A');
    const sub = add('Sub', { parentId: a });
    const b = add('B');
    const before = steps();
    moveItemsToList([a, sub, b], other);
    expect([a, sub, b].map((id) => item(id).listId)).toEqual([other, other, other]);
    // The subtask stayed under its parent instead of becoming a top-level task.
    expect(item(sub).parentId).toBe(a);
    expect(item(a).parentId).toBeNull();
    expect(steps()).toBe(before + 1);
    undo();
    expect([a, sub, b].map((id) => item(id).listId)).toEqual([list, list, list]);
    expect(item(sub).parentId).toBe(a);
  });

  it('moves a lone selected subtask to the top level of the other list', () => {
    const a = add('A');
    const sub = add('Sub', { parentId: a });
    const b = add('B');
    moveItemsToList([sub, b], other);
    expect(item(sub)).toMatchObject({ listId: other, parentId: null });
    expect(item(a).listId).toBe(list);
  });

  // Bug it prevents: with a repeating parent and its subtask both selected, the parent moved to
  // its next date and then the subtask was ticked, so the new occurrence began half done.
  it('completes a repeating parent without ticking its selected subtask', () => {
    const r = add('R', {
      dueDate: todayKey(),
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    });
    const sub = add('S', { parentId: r });
    const before = steps();
    setCheckedMany([r, sub], true);
    expect(item(r).dueDate).toBe(addDaysKey(todayKey(), 1));
    expect(item(r).checked).toBe(false);
    expect(item(sub).checked).toBe(false);
    expect(steps()).toBe(before + 1);
  });

  // Bug it prevents: deleting a parent with its selected subtask made extra undo steps or
  // left the subtask out of the Trash.
  it('deletes a parent with its selected subtask as one undo step', () => {
    const a = add('A');
    const sub = add('Sub', { parentId: a });
    const b = add('B');
    const before = steps();
    deleteItems([a, sub, b]);
    expect([a, sub, b].map((id) => item(id).deletedAt !== null)).toEqual([true, true, true]);
    expect(steps()).toBe(before + 1);
    undo();
    expect([a, sub, b].map((id) => item(id).deletedAt)).toEqual([null, null, null]);
  });
});
