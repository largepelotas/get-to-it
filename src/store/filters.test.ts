import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Priority } from '@/data/types';
import { createFilter } from './actions/filters';
import { createItem, setChecked } from './actions/items';
import { createLabel } from './actions/labels';
import { archiveList, createList } from './actions/lists';
import { resetForTests, useData } from './data';
import {
  compileQuery,
  filterContext,
  filterCounts,
  filterRows,
  matrixModel,
  resolvedDefaults,
  sortedFilters,
} from './filters';

const today = '2026-10-01';
let work: string;
let home: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  work = createList({ type: 'todo', title: 'Work' });
  home = createList({ type: 'todo', title: 'Home' });
});

const tables = () => useData.getState().tables;
const add = (
  listId: string,
  text: string,
  extra: { dueDate?: string | null; priority?: Priority; labelIds?: string[] } = {},
) => createItem(listId, { text, ...extra })!;
const texts = (r: { item: { text: string } }[]) => r.map((x) => x.item.text);

describe('compileQuery and filterRows', () => {
  // Bug prevented: a filter showing tasks from an archived list, or completed ones.
  it('finds open tasks in live to-do lists only', () => {
    const old = createList({ type: 'todo', title: 'Old' });
    createList({ type: 'grocery', title: 'Shop' });
    add(work, 'Report', { dueDate: today, priority: 1 });
    const done = add(work, 'Done', { dueDate: today, priority: 1 });
    setChecked(done, true);
    add(old, 'Archived', { dueDate: today, priority: 1 });
    archiveList(old);
    const compiled = compileQuery('p1 & today', tables(), today);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const { items, lists } = tables();
    expect(texts(filterRows(items, lists, compiled.match))).toEqual(['Report']);
  });

  // Bug prevented: #Name finding an archived list, so a stale filter looked fine.
  it('reads #List against live to-do lists only, and says when there is none', () => {
    const old = createList({ type: 'todo', title: 'Old' });
    archiveList(old);
    expect(filterContext(tables(), today).lists.map((l) => l.title)).toEqual(['Work', 'Home']);
    expect(compileQuery('#old', tables(), today)).toEqual({
      ok: false,
      error: 'There’s no list called “old”.',
    });
    expect(compileQuery('#work', tables(), today).ok).toBe(true);
  });
});

describe('filterCounts', () => {
  // Bug prevented: a filter that doesn't compile showing a count of 0 as if it matched nothing.
  it('counts matches per filter and leaves out filters that cannot run', () => {
    add(work, 'A', { priority: 1 });
    add(home, 'B', { priority: 1 });
    add(home, 'C');
    const p1 = createFilter({ name: 'Important', query: 'p1' })!;
    const broken = createFilter({ name: 'Broken', query: '@nothing' })!;
    const none = createFilter({ name: 'Empty', query: 'p3' })!;
    const counts = filterCounts(tables(), today);
    expect(counts.get(p1)).toBe(2);
    expect(counts.get(none)).toBe(0);
    expect(counts.has(broken)).toBe(false);
  });
});

describe('sortedFilters', () => {
  it('keeps the order filters were made in', () => {
    createFilter({ name: 'B', query: 'p2' });
    createFilter({ name: 'A', query: 'p1' });
    expect(sortedFilters(tables().filters).map((f) => f.name)).toEqual(['B', 'A']);
  });
});

describe('resolvedDefaults', () => {
  // Bug prevented: a task added in the "#Home & @errands & p1" view going to the default list
  // without the label, so it never showed there.
  it('turns the required list and labels into ids, with the due day and priority', () => {
    const errands = createLabel('Errands')!;
    expect(resolvedDefaults('#home & @ERRANDS & p1 & tomorrow', tables())).toEqual({
      listId: home,
      labelIds: [errands],
      due: 'tomorrow',
      priority: 1,
    });
    expect(resolvedDefaults('@missing | p1', tables())).toEqual({
      listId: null,
      labelIds: [],
      due: null,
      priority: null,
    });
    expect(resolvedDefaults('p1 &', tables())).toMatchObject({ priority: null });
  });
});

describe('matrixModel', () => {
  // Bug prevented: a task that is both urgent and important landing in two boxes.
  it('puts every open task in exactly one box', () => {
    add(work, 'Fire', { dueDate: '2026-09-30', priority: 1 });
    add(work, 'Plan', { dueDate: '2026-10-20', priority: 2 });
    add(home, 'Chore', { dueDate: today });
    add(home, 'Someday');
    const model = matrixModel(tables(), { urgent: 'overdue | today', important: 'p1 | p2' }, today);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(texts(model.boxes.do)).toEqual(['Fire']);
    expect(texts(model.boxes.schedule)).toEqual(['Plan']);
    expect(texts(model.boxes.delegate)).toEqual(['Chore']);
    expect(texts(model.boxes.drop)).toEqual(['Someday']);
  });

  it('says which search is broken', () => {
    expect(matrixModel(tables(), { urgent: 'p1 &', important: 'p1' }, today)).toEqual({
      ok: false,
      which: 'urgent',
      error: 'Something is missing after &.',
    });
    expect(matrixModel(tables(), { urgent: 'today', important: '#nope' }, today)).toMatchObject({
      ok: false,
      which: 'important',
    });
  });
});
