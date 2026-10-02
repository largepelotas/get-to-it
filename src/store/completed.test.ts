import { describe, expect, it } from 'vitest';
import type { Completion, Item, List } from '@/data/types';
import { completedEntries, groupByDay, type CompletedEntry } from './completed';

const at = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

const list = (id: string, extra: Partial<List> = {}): List => ({
  id,
  folderId: null,
  type: 'todo',
  title: id,
  color: null,
  pinned: false,
  sortKey: id,
  showCompleted: false,
  archivedAt: null,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  listId: 'work',
  parentId: null,
  text: `Task ${id}`,
  checked: true,
  wontDo: false,
  completedAt: at(2026, 10, 1),
  sortKey: id,
  sectionId: null,
  labelIds: [],
  collapsed: false,
  details: null,
  dueDate: null,
  dueTime: null,
  endTime: null,
  deadline: null,
  priority: 0,
  recurrence: null,
  quantity: null,
  category: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  ...extra,
});

const completion = (id: string, itemId: string, completedAt: number): Completion => ({
  id,
  itemId,
  dueDate: null,
  completedAt,
});

const tablesOf = (
  items: Item[],
  lists: List[] = [list('work')],
  completions: Completion[] = [],
) => ({
  items: Object.fromEntries(items.map((i) => [i.id, i])),
  lists: Object.fromEntries(lists.map((l) => [l.id, l])),
  completions: Object.fromEntries(completions.map((c) => [c.id, c])),
});

describe('completedEntries', () => {
  // Bug prevented: a finished task, a won't-do task or a repeat completion mislabelled or missing.
  it('makes one entry per kind', () => {
    const t = tablesOf(
      [
        item('a', { completedAt: at(2026, 10, 1, 9) }),
        item('b', { wontDo: true, completedAt: at(2026, 10, 1, 10) }),
        item('c', { checked: false, completedAt: null, text: 'Water plants' }),
      ],
      [list('work')],
      [completion('x', 'c', at(2026, 10, 1, 11))],
    );
    const entries = completedEntries(t);
    expect(entries.map((e) => [e.itemId, e.kind])).toEqual([
      ['c', 'repeat'],
      ['b', 'wontDo'],
      ['a', 'done'],
    ]);
    expect(entries[0]).toMatchObject({
      text: 'Water plants',
      listId: 'work',
      day: '2026-10-01',
      completedAt: at(2026, 10, 1, 11),
    });
  });

  // Bug prevented: open tasks, or checked ones with no timestamp, showing as finished.
  it('leaves out unchecked tasks and checked tasks without a time', () => {
    const t = tablesOf([
      item('open', { checked: false, completedAt: null }),
      item('stale', { checked: false, completedAt: at(2026, 9, 1) }),
      item('notime', { completedAt: null }),
    ]);
    expect(completedEntries(t)).toEqual([]);
  });

  // Bug prevented: deleted tasks, trashed lists and grocery lists leaking into history.
  it('leaves out deleted items, trashed lists, missing lists and other list types', () => {
    const t = tablesOf(
      [
        item('gone', { deletedAt: 1 }),
        item('trashed', { listId: 'bin' }),
        item('orphan', { listId: 'nowhere' }),
        item('shop', { listId: 'groceries' }),
        item('ok'),
      ],
      [list('work'), list('bin', { deletedAt: 5 }), list('groceries', { type: 'grocery' })],
    );
    expect(completedEntries(t).map((e) => e.itemId)).toEqual(['ok']);
  });

  // Bug prevented: finished work vanishing from history once its list is archived.
  it('includes archived lists', () => {
    const t = tablesOf([item('a', { listId: 'old' })], [list('old', { archivedAt: 9 })]);
    expect(completedEntries(t).map((e) => e.itemId)).toEqual(['a']);
  });

  // Bug prevented: a repeat completion for a deleted task showing a blank or stale row.
  it('drops a completion whose item was deleted or is missing', () => {
    const t = tablesOf(
      [item('d', { checked: false, completedAt: null, deletedAt: 3 })],
      [list('work')],
      [completion('x', 'd', at(2026, 10, 1)), completion('y', 'missing', at(2026, 10, 1))],
    );
    expect(completedEntries(t)).toEqual([]);
  });

  // Bug prevented: subtasks being hidden because only top-level tasks were counted.
  it('counts subtasks as tasks of their own', () => {
    const t = tablesOf([
      item('p', { completedAt: at(2026, 10, 1, 8) }),
      item('s', { parentId: 'p' }),
    ]);
    expect(completedEntries(t)).toHaveLength(2);
  });

  // Bug prevented: unstable or oldest-first ordering.
  it('sorts newest first', () => {
    const t = tablesOf([
      item('a', { completedAt: at(2026, 9, 30) }),
      item('b', { completedAt: at(2026, 10, 2) }),
      item('c', { completedAt: at(2026, 10, 1) }),
    ]);
    expect(completedEntries(t).map((e) => e.itemId)).toEqual(['b', 'c', 'a']);
  });

  // Bug prevented: late-evening tasks landing on the wrong day (UTC instead of local day).
  it('puts 23:59 and 00:01 on different local days', () => {
    const t = tablesOf([
      item('late', { completedAt: at(2026, 10, 1, 23, 59) }),
      item('early', { completedAt: at(2026, 10, 2, 0, 1) }),
    ]);
    const days = Object.fromEntries(completedEntries(t).map((e) => [e.itemId, e.day]));
    expect(days).toEqual({ late: '2026-10-01', early: '2026-10-02' });
  });
});

describe('groupByDay', () => {
  const entry = (key: string, completedAt: number): CompletedEntry => ({
    key,
    itemId: key,
    text: key,
    listId: 'work',
    completedAt,
    day: new Date(completedAt).toLocaleDateString('en-CA'),
    kind: 'done',
  });

  // Bug prevented: days or entries in the wrong order, or one day split into two groups.
  it('groups newest day first and newest entry first within a day', () => {
    const a = entry('a', at(2026, 10, 2, 15));
    const b = entry('b', at(2026, 10, 2, 9));
    const c = entry('c', at(2026, 10, 1, 20));
    const groups = groupByDay([c, b, a]);
    expect(groups.map((g) => [g.day, g.entries.map((e) => e.key)])).toEqual([
      ['2026-10-02', ['a', 'b']],
      ['2026-10-01', ['c']],
    ]);
  });

  // Bug prevented: an empty history throwing or producing a blank group.
  it('returns nothing for nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
