import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Priority } from '@/data/types';
import { createItem } from './actions/items';
import { createLabel } from './actions/labels';
import { createList } from './actions/lists';
import { createSection } from './actions/sections';
import type { GroupContext } from './arrange';
import { boardColumns, boardGroup } from './board';
import { resetForTests, useData } from './data';
import { openRows } from './smart';

const today = '2026-10-01';
let work: string;
let home: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  work = createList({ type: 'todo', title: 'Work' });
  home = createList({ type: 'todo', title: 'Home' });
});

const add = (
  listId: string,
  text: string,
  extra: {
    dueDate?: string | null;
    priority?: Priority;
    labelIds?: string[];
    sectionId?: string;
    parentId?: string;
  } = {},
) => createItem(listId, { text, ...extra })!;

const rows = () => {
  const { items, lists } = useData.getState().tables;
  return openRows(items, lists, () => true);
};
const texts = (r: { item: { text: string } }[]) => r.map((x) => x.item.text);
const ctx = (extra: Partial<GroupContext> = {}): GroupContext => {
  const { lists, labels, sections, items } = useData.getState().tables;
  return { today, lists, labels, sections, items, listId: work, ...extra };
};
const keys = (cols: { key: string }[]) => cols.map((c) => c.key);

describe('boardColumns by priority', () => {
  // Bug prevented: an empty priority column missing, leaving nowhere to drop a card on it.
  it('has all four columns in order, empty or not, each a priority drop', () => {
    add(work, 'A', { priority: 1 });
    add(work, 'B');
    const cols = boardColumns(rows(), 'priority', ctx());
    expect(keys(cols)).toEqual(['p1', 'p2', 'p3', 'p0']);
    expect(cols.map((c) => c.title)).toEqual([
      'Priority 1',
      'Priority 2',
      'Priority 3',
      'No priority',
    ]);
    expect(cols.map((c) => texts(c.rows))).toEqual([['A'], [], [], ['B']]);
    expect(cols[1].drop).toEqual({ kind: 'priority', priority: 2 });
    expect(cols[3].drop).toEqual({ kind: 'priority', priority: 0 });
  });
});

describe('boardColumns by section', () => {
  // Bug prevented: a section with no tasks having no column, so cards can't be dragged into it.
  it('has No section first, then every section in order, empty or not', () => {
    const s1 = createSection(work, 'First')!;
    const s2 = createSection(work, 'Second')!;
    add(work, 'Loose');
    add(work, 'In second', { sectionId: s2 });
    const cols = boardColumns(
      rows().filter((r) => r.list.id === work),
      'section',
      ctx(),
    );
    expect(keys(cols)).toEqual(['no-section', `section:${s1}`, `section:${s2}`]);
    expect(cols.map((c) => c.title)).toEqual(['No section', 'First', 'Second']);
    expect(cols.map((c) => texts(c.rows))).toEqual([['Loose'], [], ['In second']]);
    expect(cols.map((c) => c.drop)).toEqual([
      { kind: 'section', sectionId: null },
      { kind: 'section', sectionId: s1 },
      { kind: 'section', sectionId: s2 },
    ]);
  });

  // Bug prevented: a subtask showing in No section while its parent sits in a section.
  it("puts a subtask in its top-level ancestor's section", () => {
    const s1 = createSection(work, 'First')!;
    const parent = add(work, 'Parent', { sectionId: s1 });
    const child = add(work, 'Child', { parentId: parent });
    add(work, 'Grandchild', { parentId: child });
    const cols = boardColumns(rows(), 'section', ctx());
    expect(texts(cols[0].rows)).toEqual([]);
    expect(texts(cols[1].rows).sort()).toEqual(['Child', 'Grandchild', 'Parent']);
  });
});

describe('boardColumns by label', () => {
  // Bug prevented: a label with no task in view having no column, or a multi-label task listed twice.
  it('has a column per label in order plus No label, and a task sits under its first label', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    createLabel('empty');
    add(work, 'Both', { labelIds: [b, a] });
    add(work, 'Only b', { labelIds: [b] });
    add(work, 'None');
    const cols = boardColumns(rows(), 'label', ctx());
    expect(cols.map((c) => c.title)).toEqual(['a', 'b', 'empty', 'No label']);
    expect(cols.map((c) => texts(c.rows))).toEqual([['Both'], ['Only b'], [], ['None']]);
    expect(cols[2].drop).toEqual({ kind: 'label', labelId: expect.any(String) });
    expect(cols[3].key).toBe('no-label');
    expect(cols[3].drop).toEqual({ kind: 'label', labelId: null });
  });
});

describe('boardColumns by date', () => {
  // Bug prevented: Today/Tomorrow/No date vanishing when empty, leaving no place to drop a card.
  it('always has Today, Tomorrow and No date, and no Overdue without overdue rows', () => {
    const cols = boardColumns([], 'date', ctx());
    expect(keys(cols)).toEqual([today, '2026-10-02', 'no-date']);
    expect(cols.map((c) => c.title)).toEqual(['Today', 'Tomorrow', 'No date']);
    expect(cols.map((c) => c.drop)).toEqual([
      { kind: 'date', date: today },
      { kind: 'date', date: '2026-10-02' },
      { kind: 'date', date: null },
    ]);
    expect(cols[0].timeOnly).toBe(true);
  });

  // Bug prevented: each overdue day getting its own column (groupRows does), which a board can't drop onto.
  it('puts every overdue row in one danger column that is not a drop target', () => {
    add(work, 'Old', { dueDate: '2026-09-20' });
    add(work, 'Older', { dueDate: '2026-09-30' });
    const cols = boardColumns(rows(), 'date', ctx());
    expect(keys(cols)).toEqual(['overdue', today, '2026-10-02', 'no-date']);
    expect(cols[0]).toMatchObject({ title: 'Overdue', tone: 'danger', drop: null });
    expect(texts(cols[0].rows).sort()).toEqual(['Old', 'Older']);
  });

  // Bug prevented: later days missing or unsorted, or titled from the wall clock rather than `today`.
  it('adds later days that have rows, sorted, titled relative to the given today', () => {
    add(work, 'Far', { dueDate: '2026-10-09' });
    add(work, 'Mid', { dueDate: '2026-10-05' });
    add(work, 'Tmrw', { dueDate: '2026-10-02' });
    add(work, 'Whenever');
    const cols = boardColumns(rows(), 'date', ctx());
    expect(keys(cols)).toEqual([today, '2026-10-02', '2026-10-05', '2026-10-09', 'no-date']);
    expect(cols.map((c) => c.title)).toEqual([
      'Today',
      'Tomorrow',
      'Monday',
      'Fri, Oct 9',
      'No date',
    ]);
    expect(texts(cols[1].rows)).toEqual(['Tmrw']);
    expect(texts(cols[4].rows)).toEqual(['Whenever']);
  });
});

describe('boardColumns by list', () => {
  // Bug prevented: a board with a column for every list in the app, most of them empty.
  it('has a column per list that has rows, in list order', () => {
    add(home, 'H');
    add(work, 'W');
    const cols = boardColumns(rows(), 'list', ctx());
    expect(cols.map((c) => c.title)).toEqual(['Work', 'Home']);
    expect(cols[1].key).toBe(`list:${home}`);
    expect(cols[1].drop).toEqual({ kind: 'list', listId: home });
  });
});

describe('boardGroup', () => {
  // Bug prevented: a board for Today or Upcoming with the list's default (sections), which has none.
  it('picks a sensible grouping for default and none', () => {
    expect(boardGroup({ kind: 'list', listId: work }, 'default')).toBe('section');
    expect(boardGroup({ kind: 'list', listId: work }, 'none')).toBe('section');
    expect(boardGroup({ kind: 'upcoming' }, 'default')).toBe('date');
    expect(boardGroup({ kind: 'next7' }, 'none')).toBe('date');
    expect(boardGroup({ kind: 'today' }, 'default')).toBe('priority');
    expect(boardGroup({ kind: 'label', labelId: 'x' }, 'none')).toBe('priority');
  });

  it('returns any other grouping as it is', () => {
    expect(boardGroup({ kind: 'today' }, 'label')).toBe('label');
    expect(boardGroup({ kind: 'list', listId: work }, 'priority')).toBe('priority');
  });
});
