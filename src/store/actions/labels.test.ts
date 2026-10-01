import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { redo, resetForTests, undo, useData } from '../data';
import { labelCounts, labelRows, sortedLabels } from '../labels';
import {
  createItem,
  createItemFromText,
  createItemsFromLines,
  deleteItems,
  duplicateItem,
  moveItemToList,
  setChecked,
} from './items';
import {
  createLabel,
  deleteLabel,
  itemLabels,
  moveLabelBy,
  renameLabel,
  setItemLabels,
  setLabelColor,
  toggleLabelOnItems,
} from './labels';
import { archiveList, createList, deleteList, duplicateList, restoreList } from './lists';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

const state = () => useData.getState();
const items = () => state().tables.items;
const labels = () => state().tables.labels;
const steps = () => state().past.length;
const names = () => sortedLabels(labels()).map((l) => l.name);

describe('label actions', () => {
  // Bug prevented: a blank or duplicate name making a second label, or two undo steps for one add.
  it('createLabel is one undo step, returns the existing id for the same name in any case, and refuses blank', () => {
    const before = steps();
    const id = createLabel('  @Errands  ')!;
    expect(steps()).toBe(before + 1);
    expect(labels()[id]).toMatchObject({ name: 'Errands', color: null });
    expect(createLabel('errands')).toBe(id);
    expect(createLabel('ERRANDS')).toBe(id);
    expect(steps()).toBe(before + 1);
    expect(createLabel('   ')).toBeNull();
    expect(createLabel('@')).toBeNull();
    expect(Object.keys(labels())).toHaveLength(1);
    undo();
    expect(Object.keys(labels())).toHaveLength(0);
  });

  it('createLabel collapses inner spaces, takes a colour, and adds to the end', () => {
    createLabel('one');
    const id = createLabel('deep    work', { color: 'teal' })!;
    expect(labels()[id]).toMatchObject({ name: 'deep work', color: 'teal' });
    expect(names()).toEqual(['one', 'deep work']);
  });

  // Bug prevented: a rename making two labels that @name cannot tell apart.
  it('renameLabel refuses a blank name or another label’s name, allows a case change', () => {
    const a = createLabel('home')!;
    const b = createLabel('work')!;
    const before = steps();
    expect(renameLabel(a, '  ')).toBe(false);
    expect(renameLabel(a, 'WORK')).toBe(false);
    expect(renameLabel(b, 'work')).toBe(true);
    expect(steps()).toBe(before);
    expect(renameLabel(b, 'Work')).toBe(true);
    expect(labels()[b].name).toBe('Work');
    expect(renameLabel(a, '@ house  boat ')).toBe(true);
    expect(labels()[a].name).toBe('house boat');
    expect(steps()).toBe(before + 2);
    undo();
    expect(labels()[a].name).toBe('home');
  });

  it('setLabelColor sets and clears, one undo step each', () => {
    const a = createLabel('home')!;
    const before = steps();
    setLabelColor(a, 'red');
    expect(labels()[a].color).toBe('red');
    setLabelColor(a, null);
    expect(labels()[a].color).toBeNull();
    expect(steps()).toBe(before + 2);
  });

  it('moveLabelBy reorders, and says no at either end', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    const c = createLabel('c')!;
    expect(moveLabelBy(a, -1)).toBe(false);
    expect(moveLabelBy(c, 1)).toBe(false);
    expect(moveLabelBy(c, -1)).toBe(true);
    expect(names()).toEqual(['a', 'c', 'b']);
    expect(moveLabelBy(a, 1)).toBe(true);
    expect(names()).toEqual(['c', 'a', 'b']);
    undo();
    expect(names()).toEqual(['a', 'c', 'b']);
    expect(b).toBeTruthy();
  });

  // Bug prevented: a deleted label leaving ids on tasks, or undo bringing back only half.
  it('deleteLabel strips the id from every task in one undo step, and undo restores both', () => {
    const home = createLabel('home')!;
    const work = createLabel('work')!;
    const t1 = createItem(list, { text: 'one', labelIds: [home, work] })!;
    const t2 = createItem(list, { text: 'two', labelIds: [home] })!;
    const t3 = createItem(list, { text: 'three' })!;
    const before = steps();
    deleteLabel(home);
    expect(steps()).toBe(before + 1);
    expect(labels()[home]).toBeUndefined();
    expect(items()[t1].labelIds).toEqual([work]);
    expect(items()[t2].labelIds).toEqual([]);
    expect(items()[t3].labelIds).toEqual([]);
    undo();
    expect(labels()[home].name).toBe('home');
    expect(items()[t1].labelIds).toEqual([home, work]);
    expect(items()[t2].labelIds).toEqual([home]);
    redo();
    expect(labels()[home]).toBeUndefined();
  });

  // Bug prevented: unknown ids or duplicates getting onto a task and showing as empty chips.
  it('setItemLabels replaces the labels, dropping unknown ids and duplicates, in one step', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    const t = createItem(list, { text: 'task' })!;
    const before = steps();
    setItemLabels(t, [b, 'missing', a, b]);
    expect(items()[t].labelIds).toEqual([b, a]);
    expect(steps()).toBe(before + 1);
    setItemLabels(t, [b, a]);
    expect(steps()).toBe(before + 1);
    setItemLabels(t, []);
    expect(items()[t].labelIds).toEqual([]);
    undo();
    expect(items()[t].labelIds).toEqual([b, a]);
  });

  // Bug prevented: labels landing on grocery items, which have no label UI.
  it('never puts labels on a grocery item', () => {
    const l = createLabel('a')!;
    const grocery = createList({ type: 'grocery', title: 'Shop' });
    const g = createItem(grocery, { text: 'milk', labelIds: [l] })!;
    expect(items()[g].labelIds).toEqual([]);
    setItemLabels(g, [l]);
    toggleLabelOnItems([g], l);
    expect(items()[g].labelIds).toEqual([]);
  });

  describe('toggleLabelOnItems', () => {
    // Bug prevented: toggling a mixed selection removing the label instead of adding it everywhere.
    it('adds to those that lack it when some have it, and removes from all when all do', () => {
      const l = createLabel('x')!;
      const other = createLabel('y')!;
      const t1 = createItem(list, { text: '1', labelIds: [other, l] })!;
      const t2 = createItem(list, { text: '2' })!;
      const before = steps();
      toggleLabelOnItems([t1, t2], l);
      expect(items()[t1].labelIds).toEqual([other, l]);
      expect(items()[t2].labelIds).toEqual([l]);
      expect(steps()).toBe(before + 1);
      toggleLabelOnItems([t1, t2], l);
      expect(items()[t1].labelIds).toEqual([other]);
      expect(items()[t2].labelIds).toEqual([]);
      expect(steps()).toBe(before + 2);
      undo();
      expect(items()[t2].labelIds).toEqual([l]);
    });

    it('adds when none have it, in one step', () => {
      const l = createLabel('x')!;
      const t1 = createItem(list, { text: '1' })!;
      const t2 = createItem(list, { text: '2' })!;
      const before = steps();
      toggleLabelOnItems([t1, t2], l);
      expect(items()[t1].labelIds).toEqual([l]);
      expect(items()[t2].labelIds).toEqual([l]);
      expect(steps()).toBe(before + 1);
    });
  });
});

describe('labels on tasks', () => {
  // Bug prevented: "@errands" staying in the title, or the label not being made in the same undo step.
  it('createItemFromText with an existing label puts it on the task and removes it from the title', () => {
    const id = createLabel('errands')!;
    const before = steps();
    const t = createItemFromText(list, 'Buy stamps @Errands')!;
    expect(items()[t]).toMatchObject({ text: 'Buy stamps', labelIds: [id] });
    expect(steps()).toBe(before + 1);
  });

  it('createItemFromText creates a new label in the same undo step, and undo removes both', () => {
    const before = steps();
    const t = createItemFromText(list, 'Call bank @phone')!;
    expect(names()).toEqual(['phone']);
    expect(items()[t]).toMatchObject({
      text: 'Call bank',
      labelIds: [sortedLabels(labels())[0].id],
    });
    expect(steps()).toBe(before + 1);
    undo();
    expect(names()).toEqual([]);
    expect(items()[t]).toBeUndefined();
  });

  it('createItemFromText with two labels keeps the order typed', () => {
    const a = createLabel('a')!;
    const t = createItemFromText(list, '@b Thing @a')!;
    const b = sortedLabels(labels()).find((l) => l.name === 'b')!.id;
    expect(items()[t].labelIds).toEqual([a, b]);
    expect(items()[t].text).toBe('Thing');
  });

  // Bug prevented: pasting a list that names a new label on two lines making it twice.
  it('createItemsFromLines makes a label named on two lines once, in one undo step', () => {
    const before = steps();
    const ids = createItemsFromLines(list, ['one @new', 'two @NEW']);
    expect(ids).toHaveLength(2);
    expect(names()).toEqual(['new']);
    const only = sortedLabels(labels())[0].id;
    expect(items()[ids[0]].labelIds).toEqual([only]);
    expect(items()[ids[1]].labelIds).toEqual([only]);
    expect(steps()).toBe(before + 1);
    undo();
    expect(Object.keys(labels())).toHaveLength(0);
  });

  // Bug prevented: a copy of a task or list losing its labels, or sharing the array with the original.
  it('duplicateItem and duplicateList keep labels', () => {
    const l = createLabel('x')!;
    const t = createItem(list, { text: 'task', labelIds: [l] })!;
    const sub = createItem(list, { text: 'sub', parentId: t, labelIds: [l] })!;
    const copy = duplicateItem(t)!;
    expect(items()[copy].labelIds).toEqual([l]);
    const copySub = Object.values(items()).find((i) => i.parentId === copy)!;
    expect(copySub.labelIds).toEqual([l]);
    expect(items()[copy].labelIds).not.toBe(items()[t].labelIds);
    const dup = duplicateList(list)!;
    const inDup = Object.values(items()).filter((i) => i.listId === dup);
    expect(inDup.length).toBeGreaterThan(0);
    for (const i of inDup) expect(i.labelIds).toEqual([l]);
    expect(items()[sub].labelIds).toEqual([l]);
  });

  it('moving a task to another list keeps its labels', () => {
    const l = createLabel('x')!;
    const t = createItem(list, { text: 'task', labelIds: [l] })!;
    const other = createList({ type: 'todo', title: 'Other' });
    moveItemToList(t, other);
    expect(items()[t]).toMatchObject({ listId: other, labelIds: [l] });
  });

  it('restoring a list from the Trash keeps its tasks’ labels', () => {
    const l = createLabel('x')!;
    const t = createItem(list, { text: 'task', labelIds: [l] })!;
    deleteList(list);
    restoreList(list);
    expect(items()[t]).toMatchObject({ deletedAt: null, labelIds: [l] });
  });
});

describe('label model', () => {
  // Bug prevented: the label view showing finished, deleted or hidden-list tasks.
  it('labelRows leaves out completed, deleted, archived-list and trashed-list tasks, and includes a subtask', () => {
    const l = createLabel('x')!;
    const open = createItem(list, { text: 'open', labelIds: [l] })!;
    const sub = createItem(list, { text: 'sub', parentId: open, labelIds: [l] })!;
    const done = createItem(list, { text: 'done', labelIds: [l] })!;
    setChecked(done, true);
    const gone = createItem(list, { text: 'gone', labelIds: [l] })!;
    deleteItems([gone]);
    createItem(list, { text: 'unlabelled' });
    const archived = createList({ type: 'todo', title: 'Old' });
    createItem(archived, { text: 'in archived', labelIds: [l] });
    archiveList(archived);
    const trashed = createList({ type: 'todo', title: 'Bin' });
    createItem(trashed, { text: 'in trash', labelIds: [l] });
    deleteList(trashed);

    const { tables } = state();
    const rows = labelRows(tables.items, tables.lists, l);
    expect(rows.map((r) => r.item.text).sort()).toEqual(['open', 'sub']);
    const subRow = rows.find((r) => r.item.id === sub)!;
    expect(subRow.list.id).toBe(list);
    expect(subRow.parent?.id).toBe(open);
    expect(labelCounts(tables.items, tables.lists).get(l)).toBe(2);
    expect(labelRows(tables.items, tables.lists, 'nope')).toEqual([]);
    restoreList(archived);
  });

  it('labelCounts counts each open task once per label, and omits labels with none', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    createLabel('empty');
    createItem(list, { text: '1', labelIds: [a, b] });
    createItem(list, { text: '2', labelIds: [a] });
    const { tables } = state();
    const counts = labelCounts(tables.items, tables.lists);
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);
    expect(counts.size).toBe(2);
  });

  // Bug prevented: a task whose label was lost (an old import) crashing or showing an empty chip.
  it('itemLabels ignores ids with no label and sorts by label order', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    const t = createItem(list, { text: 'x', labelIds: [b, a] })!;
    const task = { ...items()[t], labelIds: [b, 'dangling', a] };
    expect(itemLabels(task, labels()).map((l) => l.name)).toEqual(['a', 'b']);
    expect(itemLabels({ labelIds: undefined as unknown as string[] }, labels())).toEqual([]);
    const { tables } = state();
    const dangling = { ...tables.items, [t]: task };
    expect(labelCounts(dangling, tables.lists).get('dangling')).toBe(1);
    expect(labelRows(dangling, tables.lists, a).map((r) => r.item.id)).toEqual([t]);
  });
});
