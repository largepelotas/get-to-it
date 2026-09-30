import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { setSetting, resetForTests, undo, useData } from '../data';
import { todoModel } from '../todo';
import { createList } from './lists';
import {
  createItem,
  createItemFromText,
  deleteItems,
  indentItem,
  itemNotesText,
  moveItem,
  moveItemBy,
  outdentItem,
  setChecked,
  setDue,
  setDueTime,
  setItemNotes,
  setItemText,
  setRecurrence,
} from './items';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

const items = () => useData.getState().tables.items;
const item = (id: string) => items()[id];
/** The open section as `text@depth`. */
const open = () => todoModel(items(), list).open.map((r) => `${r.item.text}@${r.depth}`);
const add = (text: string, place: { parentId?: string | null; after?: string | null } = {}) =>
  createItem(list, { text, ...place })!;

describe('creating items', () => {
  it('adds at the end, at the start, or after a sibling', () => {
    const a = add('A');
    add('B');
    add('Z', { after: null });
    add('A2', { after: a });
    expect(open()).toEqual(['Z@0', 'A@0', 'A2@0', 'B@0']);
  });

  it('ignores blank text', () => {
    expect(createItem(list, { text: '   ' })).toBeNull();
    expect(Object.keys(items())).toHaveLength(0);
  });

  it('reads priority and dates from typed text when the setting is on', () => {
    const id = createItemFromText(list, 'Pay invoice tomorrow p1')!;
    expect(item(id)).toMatchObject({ text: 'Pay invoice', priority: 1 });
    expect(item(id).dueDate).not.toBeNull();

    setSetting('parseDates', false);
    const raw = createItemFromText(list, 'Pay invoice tomorrow p1')!;
    expect(item(raw)).toMatchObject({
      text: 'Pay invoice tomorrow p1',
      priority: 0,
      dueDate: null,
    });
  });

  it('opens a collapsed or finished parent when a subtask is added', () => {
    const a = add('A');
    setChecked(a, true);
    add('A1', { parentId: a });
    expect(item(a).checked).toBe(false);
  });
});

describe('editing', () => {
  it('merges typing into one undo step and keeps the last non-blank text', () => {
    const a = add('A');
    setItemText(a, 'Ab');
    setItemText(a, 'Abc');
    setItemText(a, '  ');
    expect(item(a).text).toBe('Abc');
    undo();
    expect(item(a).text).toBe('A');
  });

  it('stores notes as a rich-text doc', () => {
    const a = add('A');
    setItemNotes(a, 'line one\nline two');
    expect(itemNotesText(item(a))).toBe('line one\nline two');
    setItemNotes(a, '');
    expect(item(a).details).toBeNull();
  });
});

describe('checking', () => {
  it('checks every subtask with its parent and moves it to Completed', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    const a2 = add('A2', { parentId: a });
    setChecked(a2, true);
    const firstDone = item(a2).completedAt;
    setChecked(a, true);
    expect(item(a1).checked).toBe(true);
    expect(item(a2).completedAt).toBe(firstDone);
    const model = todoModel(items(), list);
    expect(model.open).toHaveLength(0);
    expect(model.done.map((r) => r.item.text)).toEqual(['A', 'A1', 'A2']);
    expect(model.doneCount).toBe(1);
  });

  it('reopens finished parents when a subtask is unchecked', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    setChecked(a, true);
    setChecked(a1, false);
    expect(item(a)).toMatchObject({ checked: false, completedAt: null });
  });

  it('undoes a check in one step', () => {
    const a = add('A');
    add('A1', { parentId: a });
    setChecked(a, true);
    undo();
    expect(Object.values(items()).every((i) => !i.checked)).toBe(true);
  });
});

describe('deleting', () => {
  it('soft-deletes an item with its subtasks and undo brings them back', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    add('B');
    deleteItems([a]);
    expect(item(a1).deletedAt).not.toBeNull();
    expect(open()).toEqual(['B@0']);
    undo();
    expect(open()).toEqual(['A@0', 'A1@1', 'B@0']);
  });
});

describe('indent and outdent', () => {
  it('nests under the item above and moves back out after the parent', () => {
    const a = add('A');
    const b = add('B');
    add('C');
    expect(indentItem(b)).toBe(true);
    expect(open()).toEqual(['A@0', 'B@1', 'C@0']);
    expect(item(b).parentId).toBe(a);
    expect(outdentItem(b)).toBe(true);
    expect(open()).toEqual(['A@0', 'B@0', 'C@0']);
  });

  it('refuses the first item, top-level outdents and going past the depth limit', () => {
    const a = add('A');
    expect(indentItem(a)).toBe(false);
    expect(outdentItem(a)).toBe(false);
    let parent = a;
    for (let depth = 1; depth <= 3; depth++) parent = add(`L${depth}`, { parentId: parent });
    // L3 is at the deepest level, so a sibling after it can't go under it.
    const sibling = add('S', { parentId: item(parent).parentId });
    expect(indentItem(sibling)).toBe(false);
    expect(item(sibling).parentId).toBe(item(parent).parentId);
  });

  it('won’t push a subtree deeper than the limit', () => {
    add('A');
    const b = add('B');
    const b1 = add('B1', { parentId: b });
    const b2 = add('B2', { parentId: b1 });
    add('B3', { parentId: b2 });
    // B has three levels below it, so it can't go under A.
    expect(indentItem(b)).toBe(false);
  });

  it('skips finished items at the top level', () => {
    const a = add('A');
    const b = add('B');
    const c = add('C');
    setChecked(b, true);
    indentItem(c);
    expect(item(c).parentId).toBe(a);
  });
});

describe('moving', () => {
  it('moves up and down among shown siblings', () => {
    add('A');
    const b = add('B');
    add('C');
    expect(moveItemBy(b, -1)).toBe(true);
    expect(open()).toEqual(['B@0', 'A@0', 'C@0']);
    expect(moveItemBy(b, -1)).toBe(false);
    moveItemBy(b, 1);
    moveItemBy(b, 1);
    expect(open()).toEqual(['A@0', 'C@0', 'B@0']);
  });

  it('moves with subtasks to a new parent and never into its own subtree', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    const b = add('B');
    moveItem(a, b, null);
    expect(open()).toEqual(['B@0', 'A@1', 'A1@2']);
    moveItem(b, a1, null);
    expect(item(b).parentId).toBeNull();
  });

  it('reopens a finished parent when an open task is moved under it', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    const b = add('B');
    setChecked(a1, true);
    moveItem(b, a1, null);
    expect(item(a1).checked).toBe(false);
  });
});

describe('due dates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Wednesday, 30 September 2026, 10:00 local time.
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('sets and clears the date and time', () => {
    const a = add('A');
    setDue(a, '2026-10-02', '15:30');
    expect(item(a)).toMatchObject({ dueDate: '2026-10-02', dueTime: '15:30' });
    setDue(a, '2026-10-03');
    expect(item(a)).toMatchObject({ dueDate: '2026-10-03', dueTime: null });
    setDue(a, 'not a date', '15:30');
    expect(item(a)).toMatchObject({ dueDate: null, dueTime: null });
  });

  it('adds today when a time is set on an undated task, and merges time edits', () => {
    const a = add('A');
    setDueTime(a, '09:00');
    setDueTime(a, '09:30');
    expect(item(a)).toMatchObject({ dueDate: '2026-09-30', dueTime: '09:30' });
    undo();
    expect(item(a)).toMatchObject({ dueDate: null, dueTime: null });
  });

  it('gives a repeating task a date on one of its days, and clearing the date stops it', () => {
    const a = add('A');
    // Mondays and Fridays; the next is Friday 2 October.
    setRecurrence(a, { freq: 'weekly', interval: 1, weekdays: [1, 5], mode: 'schedule' });
    expect(item(a).dueDate).toBe('2026-10-02');
    setRecurrence(a, null);
    expect(item(a)).toMatchObject({ recurrence: null, dueDate: '2026-10-02' });
    setRecurrence(a, { freq: 'daily', interval: 0, mode: 'schedule' });
    expect(item(a).recurrence).toEqual({ freq: 'daily', interval: 1, mode: 'schedule' });
    setDue(a, null);
    expect(item(a).recurrence).toBeNull();
  });
});

describe('repeating tasks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  const completions = () => Object.values(useData.getState().tables.completions);

  it('moves to the next date, records the completion and reopens its subtasks', () => {
    const a = createItem(list, {
      text: 'Standup',
      dueDate: '2026-09-30',
      dueTime: '09:30',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], mode: 'schedule' },
    })!;
    const a1 = add('Notes', { parentId: a });
    setChecked(a1, true);
    expect(setChecked(a, true)).toBe('2026-10-01');
    expect(item(a)).toMatchObject({ checked: false, dueDate: '2026-10-01', dueTime: '09:30' });
    expect(item(a1).checked).toBe(false);
    expect(completions()).toMatchObject([{ itemId: a, dueDate: '2026-09-30' }]);
  });

  it('skips past today when a late task is finished', () => {
    const a = createItem(list, {
      text: 'Water plants',
      dueDate: '2026-09-20',
      recurrence: { freq: 'daily', interval: 3, mode: 'schedule' },
    })!;
    // 20, 23, 26, 29, then 2 October.
    setChecked(a, true);
    expect(item(a).dueDate).toBe('2026-10-02');
  });

  it('counts from today for "after completion" rules', () => {
    const a = createItem(list, {
      text: 'Haircut',
      dueDate: '2026-09-01',
      recurrence: { freq: 'weekly', interval: 6, mode: 'completion' },
    })!;
    setChecked(a, true);
    expect(item(a).dueDate).toBe('2026-11-11');
  });

  it('undoes a completion in one step', () => {
    const a = createItem(list, {
      text: 'Standup',
      dueDate: '2026-09-30',
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    })!;
    setChecked(a, true);
    undo();
    expect(item(a).dueDate).toBe('2026-09-30');
    expect(completions()).toHaveLength(0);
  });

  it('is finished along with its parent', () => {
    const a = add('Project');
    const a1 = createItem(list, {
      text: 'Weekly check-in',
      parentId: a,
      dueDate: '2026-09-30',
      recurrence: { freq: 'weekly', interval: 1, mode: 'schedule' },
    })!;
    setChecked(a, true);
    expect(item(a1)).toMatchObject({ checked: true, dueDate: '2026-09-30' });
    expect(completions()).toHaveLength(0);
  });
});
