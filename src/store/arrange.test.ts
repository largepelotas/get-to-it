import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Priority } from '@/data/types';
import { formatLongDate } from '@/lib/dates';
import { createItem } from './actions/items';
import { createLabel } from './actions/labels';
import { createList } from './actions/lists';
import { createSection } from './actions/sections';
import { dayTitle, groupRows, sortRows, type GroupContext } from './arrange';
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

afterEach(() => vi.useRealTimers());

const add = (
  listId: string,
  text: string,
  extra: {
    dueDate?: string | null;
    dueTime?: string;
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
const ctx = (): GroupContext => {
  const { lists, labels, sections } = useData.getState().tables;
  return { today, lists, labels, sections };
};

describe('sortRows', () => {
  // Bug prevented: "priority" leaving P1 after no-priority tasks, or ties coming out in a
  // different order each time.
  it('sorts by date, priority, name or when the task was added, with the date order as tiebreak', () => {
    // Each task is added a minute after the one before.
    vi.useFakeTimers({ toFake: ['Date'] });
    const later = (minutes: number) => vi.setSystemTime(new Date(2026, 9, 1, 9, minutes));
    later(0);
    add(work, 'Charlie', { dueDate: '2026-10-05', priority: 2 });
    later(1);
    add(work, 'alpha', { dueDate: '2026-10-03' });
    later(2);
    add(home, 'Bravo', { dueDate: '2026-10-03', priority: 1 });
    later(3);
    add(home, 'delta', { dueDate: null, priority: 3 });
    const base = rows();
    expect(texts(sortRows(base, 'date'))).toEqual(['Bravo', 'alpha', 'Charlie', 'delta']);
    expect(texts(sortRows(base, 'priority'))).toEqual(['Bravo', 'Charlie', 'delta', 'alpha']);
    expect(texts(sortRows(base, 'name'))).toEqual(['alpha', 'Bravo', 'Charlie', 'delta']);
    expect(texts(sortRows(base, 'added'))).toEqual(['Charlie', 'alpha', 'Bravo', 'delta']);
    // Manual keeps whatever order was given.
    const reversed = [...base].reverse();
    expect(sortRows(reversed, 'manual')).toBe(reversed);
  });
});

describe('groupRows', () => {
  // Bug prevented: undated tasks vanishing when grouping by date, or an overdue day losing its warning tone.
  it('groups by day, undated last, with overdue days marked', () => {
    add(work, 'Late', { dueDate: '2026-09-30' });
    add(work, 'Now', { dueDate: today, dueTime: '09:00' });
    add(home, 'Soon', { dueDate: '2026-10-02' });
    add(home, 'Whenever');
    const groups = groupRows(sortRows(rows(), 'date'), 'date', ctx());
    expect(groups.map((g) => [g.key, texts(g.rows), g.tone ?? null])).toEqual([
      ['2026-09-30', ['Late'], 'danger'],
      [today, ['Now'], null],
      ['2026-10-02', ['Soon'], null],
      ['no-date', ['Whenever'], null],
    ]);
    expect(groups[0].title).toMatch(/^Overdue · /);
    expect(groups[0].timeOnly).toBe(true);
  });

  it('groups by priority, P1 first and none last, leaving out empty levels', () => {
    add(work, 'One', { priority: 1 });
    add(work, 'None');
    add(home, 'Three', { priority: 3 });
    const groups = groupRows(rows(), 'priority', ctx());
    expect(groups.map((g) => [g.title, texts(g.rows)])).toEqual([
      ['Priority 1', ['One']],
      ['Priority 3', ['Three']],
      ['No priority', ['None']],
    ]);
  });

  it('groups by list in sidebar order', () => {
    add(home, 'H1');
    add(work, 'W1');
    add(work, 'W2');
    const groups = groupRows(rows(), 'list', ctx());
    expect(groups.map((g) => [g.title, texts(g.rows)])).toEqual([
      ['Work', ['W1', 'W2']],
      ['Home', ['H1']],
    ]);
  });

  // Bug prevented: a task with two labels showing twice, which would double it in the selection.
  it('groups by label, each task once under its first label, unlabelled last', () => {
    const errands = createLabel('Errands')!;
    const phone = createLabel('Phone')!;
    add(work, 'Both', { labelIds: [phone, errands] });
    add(work, 'Call', { labelIds: [phone] });
    add(home, 'Plain');
    const groups = groupRows(rows(), 'label', ctx());
    expect(groups.map((g) => [g.title, texts(g.rows)])).toEqual([
      ['Errands', ['Both']],
      ['Phone', ['Call']],
      ['No label', ['Plain']],
    ]);
  });

  // Bug prevented: a subtask landing in "No section" while its parent sits in a section.
  it('groups a list by its sections, unsectioned tasks first without a heading', () => {
    const later = createSection(work, 'Later')!;
    const parent = add(work, 'In section', { sectionId: later });
    add(work, 'Sub', { parentId: parent });
    add(work, 'Loose');
    const groups = groupRows(rows(), 'section', { ...ctx(), listId: work });
    expect(groups.map((g) => [g.key, texts(g.rows), !!g.bare])).toEqual([
      ['no-section', ['Loose'], true],
      [`section:${later}`, ['In section', 'Sub'], false],
    ]);
  });

  // Bug prevented: a task two levels down (its parent is a subtask, stored with no section)
  // landing in "No section" although its top-level ancestor sits in a section.
  it("groups a deeply nested subtask under its top-level ancestor's section", () => {
    const errands = createSection(work, 'Errands')!;
    const shop = add(work, 'Shop', { sectionId: errands });
    const fruit = add(work, 'Fruit', { parentId: shop });
    add(work, 'Apples', { parentId: fruit });
    add(work, 'Loose');
    const groups = groupRows(rows(), 'section', {
      ...ctx(),
      items: useData.getState().tables.items,
      listId: work,
    });
    expect(groups.map((g) => [g.key, texts(g.rows)])).toEqual([
      ['no-section', ['Loose']],
      [`section:${errands}`, ['Shop', 'Fruit', 'Apples']],
    ]);
  });

  it('puts everything in one bare group for none, and nothing for no rows', () => {
    add(work, 'A');
    expect(groupRows(rows(), 'none', ctx())).toMatchObject([{ key: 'all', bare: true }]);
    expect(groupRows([], 'date', ctx())).toEqual([]);
  });
});

describe('dayTitle', () => {
  it('marks past days overdue and gives every day its long date', () => {
    expect(dayTitle('2026-09-30', today)).toBe(`Overdue · ${formatLongDate('2026-09-30')}`);
    expect(dayTitle(today, today)).toContain(formatLongDate(today));
  });
});
