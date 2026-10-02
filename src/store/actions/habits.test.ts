import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { reminderEntries } from '@/lib/reminders';
import { commit, resetForTests, undo, useData } from '../data';
import { completedEntries } from '../completed';
import { filterRows } from '../filters';
import { checkedDays, currentStreak } from '../habits';
import { labelCounts, labelRows } from '../labels';
import { listToMarkdown } from '../markdown';
import { search } from '../search';
import { openCounts } from '../sidebar';
import { dueRows, openRows } from '../smart';
import { addHabit, setHabitGoal, toggleCheckIn } from './habits';
import { createItem, deleteItems, moveItemsToList, moveItemToList, setChecked } from './items';
import { createLabel } from './labels';
import { createList, deleteList, duplicateList } from './lists';
import { emptyTrash } from './trash';

let list: string;

beforeEach(() => {
  // Only Date is faked, so the store's timers still run. Today is Thu 1 Oct 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 1, 10, 0));
  resetForTests(new MemoryRepository());
  list = createList({ type: 'habit' });
});

afterEach(() => vi.useRealTimers());

const tables = () => useData.getState().tables;
const checkIns = () => Object.values(tables().checkIns);
const days = (id: string) => [...checkedDays(checkIns(), id)].sort();

describe('createList', () => {
  // Bug prevented: a habit list refused or left untitled because the type wasn't known.
  it('makes a habit list titled Habits', () => {
    expect(tables().lists[list]).toMatchObject({ type: 'habit', title: 'Habits' });
  });
});

describe('addHabit', () => {
  // Bug prevented: "Run at 6pm tomorrow p1 #Work" being read as a task and losing its words.
  it('keeps the text as is, with the default goal and no task fields', () => {
    const id = addHabit(list, '  Run tomorrow p1 @home ')!;
    expect(tables().items[id]).toMatchObject({
      text: 'Run tomorrow p1 @home',
      habit: { period: 'day' },
      dueDate: null,
      priority: 0,
      labelIds: [],
      checked: false,
    });
  });

  it('adds at the end, or at the top', () => {
    const a = addHabit(list, 'A')!;
    const b = addHabit(list, 'B')!;
    const c = addHabit(list, 'C', true)!;
    const order = Object.values(tables().items)
      .sort((x, y) => (x.sortKey < y.sortKey ? -1 : 1))
      .map((i) => i.id);
    expect(order).toEqual([c, a, b]);
  });

  it('ignores blank text and lists that are not habit lists, and is one undo step', () => {
    expect(addHabit(list, '  ')).toBeNull();
    const todo = createList({ type: 'todo', title: 'T' });
    expect(addHabit(todo, 'Run')).toBeNull();
    expect(Object.keys(tables().items)).toHaveLength(0);
    const id = addHabit(list, 'Run')!;
    expect(undo()).toBe('New habit');
    expect(tables().items[id]).toBeUndefined();
  });

  // Bug prevented: an ordinary task picking up a habit goal and showing up as a habit.
  it('leaves tasks outside habit lists without a goal', () => {
    const todo = createList({ type: 'todo', title: 'T' });
    const id = createItem(todo, { text: 'Task' })!;
    expect(tables().items[id].habit).toBeNull();
  });
});

describe('setHabitGoal', () => {
  it('changes the goal in one undo step', () => {
    const id = addHabit(list, 'Run')!;
    setHabitGoal(id, { period: 'week', times: 3 });
    expect(tables().items[id].habit).toEqual({ period: 'week', times: 3 });
    expect(undo()).toBe('Habit goal');
    expect(tables().items[id].habit).toEqual({ period: 'day' });
  });

  // Bug prevented: a goal of 0 or 12 times a week, which is never or never exactly met.
  it('refuses a goal that is not valid, and a task that is not a habit', () => {
    const id = addHabit(list, 'Run')!;
    setHabitGoal(id, { period: 'week', times: 0 });
    setHabitGoal(id, { period: 'week', times: 8 });
    setHabitGoal(id, { period: 'week', times: 2.5 });
    expect(tables().items[id].habit).toEqual({ period: 'day' });
    const todo = createList({ type: 'todo', title: 'T' });
    const task = createItem(todo, { text: 'Task' })!;
    setHabitGoal(task, { period: 'week', times: 2 });
    expect(tables().items[task].habit).toBeNull();
  });
});

describe('toggleCheckIn', () => {
  // Bug prevented: a second tap leaving two check-ins for the day (a streak that can't be undone).
  it('adds a day and takes it away again, one per day', () => {
    const id = addHabit(list, 'Run')!;
    toggleCheckIn(id, '2026-10-01');
    expect(days(id)).toEqual(['2026-10-01']);
    toggleCheckIn(id, '2026-09-30');
    expect(days(id)).toEqual(['2026-09-30', '2026-10-01']);
    toggleCheckIn(id, '2026-10-01');
    expect(days(id)).toEqual(['2026-09-30']);
    expect(checkIns()).toHaveLength(1);
  });

  it('is one undo step', () => {
    const id = addHabit(list, 'Run')!;
    toggleCheckIn(id, '2026-10-01');
    expect(undo()).toBe('Check in');
    expect(checkIns()).toHaveLength(0);
  });

  // Bug prevented: ticking tomorrow, which would inflate a streak before it happens.
  it('refuses days after today, bad days, and things that are not habits', () => {
    const id = addHabit(list, 'Run')!;
    toggleCheckIn(id, '2026-10-02');
    toggleCheckIn(id, 'yesterday');
    toggleCheckIn(id, '2026-02-31');
    const todo = createList({ type: 'todo', title: 'T' });
    const task = createItem(todo, { text: 'Task' })!;
    toggleCheckIn(task, '2026-10-01');
    toggleCheckIn('missing', '2026-10-01');
    expect(checkIns()).toHaveLength(0);
  });

  it('refuses a deleted habit', () => {
    const id = addHabit(list, 'Run')!;
    deleteItems([id]);
    toggleCheckIn(id, '2026-10-01');
    expect(checkIns()).toHaveLength(0);
  });
});

describe('duplicateList', () => {
  // Bug prevented: a copy that starts with the original's streak, or loses the weekly goals.
  it('copies the habits and their goals, not the check-ins', () => {
    const id = addHabit(list, 'Run')!;
    setHabitGoal(id, { period: 'week', times: 3 });
    toggleCheckIn(id, '2026-10-01');
    const copy = duplicateList(list)!;
    const copied = Object.values(tables().items).filter((i) => i.listId === copy);
    expect(tables().lists[copy].type).toBe('habit');
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ text: 'Run', habit: { period: 'week', times: 3 } });
    expect(copied[0].id).not.toBe(id);
    expect(checkIns()).toHaveLength(1);
    expect(checkIns()[0].itemId).toBe(id);
  });
});

describe('moving', () => {
  // Bug prevented: a habit landing in a to-do list, or a task in a habit list, with no way to show it.
  it('refuses a habit into a to-do list and a task into a habit list', () => {
    const todo = createList({ type: 'todo', title: 'T' });
    const habit = addHabit(list, 'Run')!;
    const task = createItem(todo, { text: 'Task' })!;
    moveItemToList(habit, todo);
    moveItemsToList([habit], todo);
    moveItemToList(task, list);
    moveItemsToList([task], list);
    expect(tables().items[habit].listId).toBe(list);
    expect(tables().items[task].listId).toBe(todo);
  });
});

describe('Trash', () => {
  // Bug prevented: check-ins left behind for a habit that is gone for good.
  it('removes a habit’s check-ins when the Trash is emptied, and only then', () => {
    const keep = addHabit(list, 'Keep')!;
    const gone = addHabit(list, 'Gone')!;
    toggleCheckIn(keep, '2026-10-01');
    toggleCheckIn(gone, '2026-10-01');
    deleteItems([gone]);
    expect(checkIns()).toHaveLength(2);
    emptyTrash();
    expect(checkIns().map((c) => c.itemId)).toEqual([keep]);
    deleteList(list);
    emptyTrash();
    expect(checkIns()).toHaveLength(0);
  });
});

describe('habits stay out of task views', () => {
  // Bug prevented: a habit (even one with a due date, a label, or a finished state) turning up in
  // Today, Upcoming, Calendar, labels, filters, Matrix, Completed, Statistics or reminders.
  it('appears in no task view’s data and not in completedEntries', () => {
    const id = addHabit(list, 'Run')!;
    const label = createLabel('Health')!;
    toggleCheckIn(id, '2026-10-01');
    commit('Force task fields', (tx) => {
      tx.update('items', id, {
        dueDate: '2026-10-01',
        labelIds: [label],
        checked: true,
        completedAt: Date.now(),
      });
      tx.put('reminders', {
        id: 'r1',
        itemId: id,
        kind: 'absolute',
        offsetMinutes: null,
        at: Date.now() + 60_000,
        firedFor: null,
        dismissedFor: null,
        snoozedUntil: null,
        constant: false,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const t = tables();
    expect(dueRows(t.items, t.lists)).toEqual([]);
    expect(openRows(t.items, t.lists, () => true)).toEqual([]);
    expect(labelRows(t.items, t.lists, label)).toEqual([]);
    expect(labelCounts(t.items, t.lists).size).toBe(0);
    expect(filterRows(t.items, t.lists, () => true)).toEqual([]);
    expect(completedEntries(t)).toEqual([]);
    expect(reminderEntries(t, '09:00', Date.now())).toEqual([]);
  });
});

describe('sidebar count', () => {
  // Bug prevented: a habit list's badge showing every habit, or counting habits already done today.
  it('is the number of habits due today', () => {
    const run = addHabit(list, 'Run')!;
    const read = addHabit(list, 'Read')!;
    const swim = addHabit(list, 'Swim')!;
    setHabitGoal(swim, { period: 'week', times: 1 });
    const input = () => ({
      checkIns: tables().checkIns,
      today: '2026-10-01',
      weekStartsOn: 1 as const,
    });
    expect(openCounts(tables().items, input()).get(list)).toBe(3);
    toggleCheckIn(run, '2026-10-01');
    expect(openCounts(tables().items, input()).get(list)).toBe(2);
    toggleCheckIn(swim, '2026-09-29'); // met for this week
    expect(openCounts(tables().items, input()).get(list)).toBe(1);
    toggleCheckIn(read, '2026-10-01');
    expect(openCounts(tables().items, input()).get(list)).toBeUndefined();
    // Without the check-in data a habit list has no count at all.
    expect(openCounts(tables().items).get(list)).toBeUndefined();
  });

  it('still counts open tasks in a to-do list', () => {
    const todo = createList({ type: 'todo', title: 'T' });
    const a = createItem(todo, { text: 'A' })!;
    createItem(todo, { text: 'B' });
    setChecked(a, true);
    expect(openCounts(tables().items).get(todo)).toBe(1);
  });
});

describe('Markdown', () => {
  // Bug prevented: a habit list exported as an empty or to-do-style file, losing goals and streaks.
  it('writes one line per habit with its goal and streak', () => {
    const run = addHabit(list, 'Run')!;
    const swim = addHabit(list, 'Swim *fast*')!;
    setHabitGoal(swim, { period: 'week', times: 3 });
    addHabit(list, 'Read');
    toggleCheckIn(run, '2026-10-01');
    toggleCheckIn(run, '2026-09-30');
    const t = tables();
    const md = listToMarkdown(t, t.lists[list], []);
    expect(md).toBe(
      '# Habits\n\n- Run (every day, 2 day streak)\n- Swim \\*fast\\* (3 times a week, No streak)\n- Read (every day, No streak)\n',
    );
    // The check-in days feed the same streak the screen will show.
    expect(currentStreak({ period: 'day' }, checkedDays(checkIns(), run), '2026-10-01', 1)).toBe(2);
  });
});

describe('search', () => {
  // Bug prevented: habits not findable from the search palette.
  it('finds a habit by name, with its list', () => {
    const id = addHabit(list, 'Meditate')!;
    const found = search(tables(), 'medit').items;
    expect(found.map((r) => r.id)).toEqual([id]);
    expect(found[0].list.id).toBe(list);
  });
});
