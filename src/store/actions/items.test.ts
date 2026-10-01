import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { setSetting, resetForTests, undo, useData } from '../data';
import { todoModel } from '../todo';
import { archiveList, createList, deleteList } from './lists';
import { addReminder, snoozeReminder } from './reminders';
import {
  createItem,
  createItemFromText,
  deleteItems,
  duplicateItem,
  indentItem,
  itemNotesText,
  moveItem,
  moveItemBy,
  moveItemToList,
  outdentItem,
  setChecked,
  setDue,
  setDueTime,
  setItemCollapsed,
  setItemNotes,
  setItemText,
  setRecurrence,
  setWontDo,
  skipOccurrence,
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

  it('stores rich notes and clears them when nothing is left', () => {
    const a = add('A');
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Call', marks: [{ type: 'bold' }] }] },
      ],
    };
    setItemNotes(a, doc);
    expect(JSON.parse(item(a).details!)).toEqual(doc);
    const steps = useData.getState().past.length;
    setItemNotes(a, doc);
    expect(useData.getState().past.length).toBe(steps);
    setItemNotes(a, { type: 'doc', content: [{ type: 'bulletList', content: [] }] });
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

describe('moving to another list', () => {
  let other: string;
  beforeEach(() => {
    other = createList({ type: 'todo', title: 'Other' });
    createItem(other, { text: 'Existing' });
  });
  const otherOpen = () => todoModel(items(), other).open.map((r) => `${r.item.text}@${r.depth}`);

  it('moves a task and its subtasks to the end of the other list', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    add('A2', { parentId: a });
    add('B');
    moveItemToList(a, other);
    expect(open()).toEqual(['B@0']);
    expect(otherOpen()).toEqual(['Existing@0', 'A@0', 'A1@1', 'A2@1']);
    expect(item(a1).listId).toBe(other);
  });

  it('makes a subtask top-level and leaves its old parent alone', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    moveItemToList(a1, other);
    expect(item(a1)).toMatchObject({ listId: other, parentId: null });
    expect(item(a)).toMatchObject({ listId: list, checked: false });
    expect(open()).toEqual(['A@0']);
  });

  it('keeps reminders, and finished tasks stay finished', () => {
    const a = add('A');
    const r = addReminder(a, { kind: 'absolute', at: 123 })!;
    setChecked(a, true);
    moveItemToList(a, other);
    expect(useData.getState().tables.reminders[r].itemId).toBe(a);
    expect(item(a)).toMatchObject({ listId: other, checked: true });
  });

  it('does nothing for the same list, or one that is archived, trashed or not a to-do list', () => {
    const a = add('A');
    const archived = createList({ type: 'todo', title: 'Old' });
    archiveList(archived);
    const trashed = createList({ type: 'todo', title: 'Gone' });
    deleteList(trashed);
    const grocery = createList({ type: 'grocery', title: 'Shop' });
    const steps = useData.getState().past.length;
    for (const target of [list, archived, trashed, grocery, 'missing']) moveItemToList(a, target);
    moveItemToList('missing', other);
    expect(item(a).listId).toBe(list);
    expect(useData.getState().past.length).toBe(steps);
  });

  it('undoes in one step', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    moveItemToList(a, other);
    expect(useData.getState().past.at(-1)?.label).toBe('Move task');
    undo();
    expect(item(a)).toMatchObject({ listId: list, parentId: null });
    expect(item(a1)).toMatchObject({ listId: list, parentId: a });
  });
});

describe('duplicating', () => {
  it('copies a task with its subtasks right after the original', () => {
    const a = createItem(list, {
      text: 'A',
      dueDate: '2026-10-02',
      dueTime: '09:00',
      priority: 2,
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    })!;
    setItemNotes(a, 'Some notes');
    const a1 = add('A1', { parentId: a });
    setItemCollapsed(a, true);
    const b = add('B');
    const copy = duplicateItem(a)!;
    expect(item(copy)).toMatchObject({
      text: 'A',
      details: item(a).details,
      dueDate: '2026-10-02',
      dueTime: '09:00',
      priority: 2,
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
      collapsed: true,
      parentId: null,
      checked: false,
    });
    expect(
      todoModel(items(), list)
        .open.filter((r) => r.depth === 0)
        .map((r) => r.item.id),
    ).toEqual([a, copy, b]);
    const copyChild = Object.values(items()).find((i) => i.parentId === copy)!;
    expect(copyChild).toMatchObject({ text: 'A1', listId: list });
    expect(copyChild.id).not.toBe(a1);
  });

  it('puts a copy of a subtask among its siblings', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    add('A2', { parentId: a });
    const copy = duplicateItem(a1)!;
    expect(item(copy).parentId).toBe(a);
    expect(open()).toEqual(['A@0', 'A1@1', 'A1@1', 'A2@1']);
  });

  it('opens every copy, and leaves reminders and completions behind', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    addReminder(a, { kind: 'absolute', at: 123 });
    setChecked(a, true);
    const copy = duplicateItem(a)!;
    const copies = Object.values(items()).filter((i) => i.id !== a && i.id !== a1);
    expect(copies).toHaveLength(2);
    expect(copies.every((i) => !i.checked && !i.wontDo && i.completedAt === null)).toBe(true);
    expect(item(copy).parentId).toBeNull();
    expect(Object.keys(useData.getState().tables.reminders)).toHaveLength(1);
    expect(Object.keys(useData.getState().tables.completions)).toHaveLength(0);
  });

  it('undoes in one step and ignores missing tasks', () => {
    const a = add('A');
    add('A1', { parentId: a });
    expect(duplicateItem('missing')).toBeNull();
    duplicateItem(a);
    expect(useData.getState().past.at(-1)?.label).toBe('Duplicate task');
    undo();
    expect(Object.keys(items())).toHaveLength(2);
  });
});

describe('skipping an occurrence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('moves to the next date after the due date, without recording a completion', () => {
    const a = createItem(list, {
      text: 'Water plants',
      dueDate: '2026-09-20',
      recurrence: { freq: 'daily', interval: 3, mode: 'schedule' },
    })!;
    const a1 = add('Fill can', { parentId: a });
    setChecked(a1, true);
    // 20, 23, 26 and 29 are past or today's neighbours; the first on or after today is 2 October.
    expect(skipOccurrence(a)).toBe('2026-10-02');
    expect(item(a)).toMatchObject({ dueDate: '2026-10-02', checked: false });
    // Subtasks stay as they were.
    expect(item(a1).checked).toBe(true);
    expect(Object.keys(useData.getState().tables.completions)).toHaveLength(0);
  });

  it('moves a future task exactly one occurrence, and an overdue one to today or later', () => {
    const rule = { freq: 'daily', interval: 1, mode: 'schedule' } as const;
    const future = createItem(list, { text: 'Soon', dueDate: '2026-10-05', recurrence: rule })!;
    const overdue = createItem(list, { text: 'Late', dueDate: '2026-09-23', recurrence: rule })!;
    const dueToday = createItem(list, { text: 'Now', dueDate: '2026-09-30', recurrence: rule })!;
    expect(skipOccurrence(future)).toBe('2026-10-06');
    expect(skipOccurrence(overdue)).toBe('2026-09-30');
    expect(skipOccurrence(dueToday)).toBe('2026-10-01');
  });

  it('counts "after completion" rules from the due date, not today', () => {
    const a = createItem(list, {
      text: 'Haircut',
      dueDate: '2026-09-01',
      recurrence: { freq: 'weekly', interval: 6, mode: 'completion' },
    })!;
    expect(skipOccurrence(a)).toBe('2026-10-13');
  });

  it('clears snoozes, and undoes in one step', () => {
    const a = createItem(list, {
      text: 'Standup',
      dueDate: '2026-09-30',
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    })!;
    const r = addReminder(a, { kind: 'relative', offsetMinutes: 0 })!;
    snoozeReminder(r, '1h');
    expect(useData.getState().tables.reminders[r].snoozedUntil).not.toBeNull();
    skipOccurrence(a);
    expect(useData.getState().tables.reminders[r].snoozedUntil).toBeNull();
    expect(useData.getState().past.at(-1)?.label).toBe('Skip occurrence');
    undo();
    expect(item(a).dueDate).toBe('2026-09-30');
  });

  it('does nothing for tasks that are finished, don’t repeat or are missing', () => {
    const rule = { freq: 'daily', interval: 1, mode: 'schedule' } as const;
    const plain = createItem(list, { text: 'Plain', dueDate: '2026-09-30' })!;
    const done = createItem(list, { text: 'Done', dueDate: '2026-09-30', recurrence: rule })!;
    // A finished repeating task can only be a subtask checked with its parent.
    const parent = add('Parent');
    const child = createItem(list, {
      text: 'Child',
      parentId: parent,
      dueDate: '2026-09-30',
      recurrence: rule,
    })!;
    setChecked(parent, true);
    expect(skipOccurrence(plain)).toBeNull();
    expect(skipOccurrence(child)).toBeNull();
    expect(skipOccurrence('missing')).toBeNull();
    expect(skipOccurrence(done)).toBe('2026-10-01');
    expect(item(plain).dueDate).toBe('2026-09-30');
    expect(item(child).dueDate).toBe('2026-09-30');
  });
});

describe("won't do", () => {
  it('closes a task and its open subtasks, leaving finished ones as they were', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    const a2 = add('A2', { parentId: a });
    setChecked(a2, true);
    const doneAt = item(a2).completedAt;
    setWontDo(a);
    expect(item(a)).toMatchObject({ checked: true, wontDo: true });
    expect(item(a).completedAt).not.toBeNull();
    expect(item(a1)).toMatchObject({ checked: true, wontDo: true });
    expect(item(a2)).toMatchObject({ checked: true, wontDo: false, completedAt: doneAt });
    const model = todoModel(items(), list);
    expect(model.open).toHaveLength(0);
    expect(model.done.map((r) => r.item.text)).toEqual(['A', 'A1', 'A2']);
    expect(useData.getState().past.at(-1)?.label).toBe("Won't do");
  });

  it('reopening clears the flag, also on parents that get reopened', () => {
    const a = add('A');
    const a1 = add('A1', { parentId: a });
    setWontDo(a);
    setChecked(a1, false);
    expect(item(a1)).toMatchObject({ checked: false, wontDo: false, completedAt: null });
    expect(item(a)).toMatchObject({ checked: false, wontDo: false, completedAt: null });
  });

  it('checking a reopened task off sets it as done, not won’t do', () => {
    const a = add('A');
    setWontDo(a);
    setChecked(a, false);
    setChecked(a, true);
    expect(item(a)).toMatchObject({ checked: true, wontDo: false });
  });

  it('is not offered for repeating, finished or missing tasks', () => {
    const rule = { freq: 'daily', interval: 1, mode: 'schedule' } as const;
    const r = createItem(list, { text: 'R', dueDate: '2026-10-02', recurrence: rule })!;
    const d = add('D');
    setChecked(d, true);
    const steps = useData.getState().past.length;
    setWontDo(r);
    setWontDo(d);
    setWontDo('missing');
    expect(item(r)).toMatchObject({ checked: false, wontDo: false });
    expect(item(d).wontDo).toBe(false);
    expect(useData.getState().past.length).toBe(steps);
  });

  it('undoes in one step', () => {
    const a = add('A');
    add('A1', { parentId: a });
    setWontDo(a);
    undo();
    expect(Object.values(items()).every((i) => !i.checked && !i.wontDo)).toBe(true);
  });
});
