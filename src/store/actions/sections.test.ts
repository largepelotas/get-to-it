import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, undo, useData } from '../data';
import { todoModel } from '../todo';
import {
  createItem,
  createItemFromText,
  duplicateItem,
  indentItem,
  moveItem,
  moveItemBy,
  moveItemToList,
  moveItemsToList,
  outdentItem,
  setChecked,
} from './items';
import { createList, deleteList, duplicateList } from './lists';
import {
  createSection,
  deleteSection,
  moveItemsToSection,
  moveSection,
  moveSectionBy,
  renameSection,
  setSectionCollapsed,
} from './sections';
import { deleteListForever, emptyTrash } from './trash';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

const state = () => useData.getState();
const items = () => state().tables.items;
const sections = () => state().tables.sections;
const steps = () => state().past.length;
/** Section ids of a list in order. */
const sectionIds = (listId = list) =>
  Object.values(sections())
    .filter((s) => s.listId === listId)
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    .map((s) => s.id);
/** The open tasks as `{ none: [...], <section title>: [...] }`, top-level only, in order. */
function view(listId = list): Record<string, string[]> {
  const model = todoModel(items(), listId, sections());
  const text = (rows: { item: { text: string }; depth: number }[]) =>
    rows.map((r) => `${r.item.text}@${r.depth}`);
  return {
    none: text(model.unsectioned),
    ...Object.fromEntries(model.sections.map((s) => [s.section.title, text(s.rows)])),
  };
}
const add = (text: string, sectionId: string | null = null, listId = list) =>
  createItem(listId, { text, sectionId })!;

/** A list with: u1 | A: a1 a2 | B: b1 */
function sample() {
  const A = createSection(list, 'A')!;
  const B = createSection(list, 'B')!;
  const u1 = add('u1');
  const a1 = add('a1', A);
  const a2 = add('a2', A);
  const b1 = add('b1', B);
  return { A, B, u1, a1, a2, b1 };
}

describe('section actions', () => {
  // Bug prevented: a section added with several clicks needing several undos, or landing out of order.
  it('creates sections at the end or after a given one, as one undo step each', () => {
    const before = steps();
    const a = createSection(list, 'A')!;
    const c = createSection(list, 'C')!;
    const b = createSection(list, 'B', { after: a })!;
    expect(steps()).toBe(before + 3);
    expect(sectionIds()).toEqual([a, b, c]);
    undo();
    expect(sectionIds()).toEqual([a, c]);
  });

  it('names a blank section "Untitled section" and refuses a list that is not a to-do list', () => {
    const id = createSection(list, '   ')!;
    expect(sections()[id].title).toBe('Untitled section');
    const notes = createList({ type: 'note', title: 'Notes' });
    expect(createSection(notes, 'X')).toBeNull();
  });

  it('renames, keeping the old title for a blank one, and collapses', () => {
    const id = createSection(list, 'A')!;
    const before = steps();
    renameSection(id, '  Kitchen ');
    expect(sections()[id].title).toBe('Kitchen');
    renameSection(id, '   ');
    expect(sections()[id].title).toBe('Kitchen');
    expect(steps()).toBe(before + 1);
    setSectionCollapsed(id, true);
    expect(sections()[id].collapsed).toBe(true);
    undo();
    // Collapsing is not an undo step, so this undid the rename.
    expect(sections()[id].title).toBe('A');
  });

  it('reorders sections with moveSection and moveSectionBy', () => {
    const a = createSection(list, 'A')!;
    const b = createSection(list, 'B')!;
    const c = createSection(list, 'C')!;
    moveSection(c, 0);
    expect(sectionIds()).toEqual([c, a, b]);
    expect(moveSectionBy(c, 1)).toBe(true);
    expect(sectionIds()).toEqual([a, c, b]);
    expect(moveSectionBy(a, -1)).toBe(false);
    expect(moveSectionBy(b, 1)).toBe(false);
    expect(moveSectionBy(b, -1)).toBe(true);
    expect(sectionIds()).toEqual([a, b, c]);
    const before = steps();
    moveSectionBy(a, 1);
    expect(steps()).toBe(before + 1);
  });

  // Bug prevented: deleting a section throwing away its tasks, or shuffling them.
  it('deletes a section, keeping its tasks after the unsectioned ones in their order', () => {
    const { A, u1, a1 } = sample();
    add('u2');
    const before = steps();
    deleteSection(A);
    expect(steps()).toBe(before + 1);
    expect(sections()[A]).toBeUndefined();
    expect(view()).toEqual({ none: ['u1@0', 'u2@0', 'a1@0', 'a2@0'], B: ['b1@0'] });
    expect(items()[u1].sectionId).toBeNull();
    undo();
    expect(sections()[A]).toBeDefined();
    expect(items()[a1].sectionId).toBe(A);
    expect(view()).toEqual({ none: ['u1@0', 'u2@0'], A: ['a1@0', 'a2@0'], B: ['b1@0'] });
  });

  it('keeps completed tasks of a deleted section, unsectioned', () => {
    const { A, a1 } = sample();
    setChecked(a1, true);
    deleteSection(A);
    expect(items()[a1]).toMatchObject({ checked: true, sectionId: null, deletedAt: null });
  });
});

describe('moveItemsToSection', () => {
  it('moves top-level tasks to the end of a section, in the order given, as one step', () => {
    const { B, u1, a1 } = sample();
    const before = steps();
    moveItemsToSection([a1, u1], B);
    expect(steps()).toBe(before + 1);
    expect(view()).toEqual({ none: [], A: ['a2@0'], B: ['b1@0', 'a1@0', 'u1@0'] });
    moveItemsToSection([a1], null);
    expect(view().none).toEqual(['a1@0']);
  });

  // Bug prevented: a subtask picked together with its parent being torn off it.
  it('lifts a lone subtask to the top level of the section, but keeps one with its parent', () => {
    const { B, a1 } = sample();
    const sub = createItem(list, { text: 'sub', parentId: a1 })!;
    const lone = createItem(list, { text: 'lone', parentId: a1 })!;
    moveItemsToSection([lone], B);
    expect(items()[lone]).toMatchObject({ parentId: null, sectionId: B });
    moveItemsToSection([a1, sub], B);
    expect(items()[sub]).toMatchObject({ parentId: a1, sectionId: null });
    expect(items()[a1]).toMatchObject({ parentId: null, sectionId: B });
    expect(view().B).toContain('sub@1');
  });

  it('ignores a section that does not exist', () => {
    const { a1 } = sample();
    const before = steps();
    moveItemsToSection([a1], 'nope');
    expect(steps()).toBe(before);
  });
});

describe('items and sections', () => {
  it('creates a task in a section, and ignores a section from another list or for a subtask', () => {
    const { A, a1 } = sample();
    const other = createList({ type: 'todo', title: 'Other' });
    const x = add('x', A);
    expect(items()[x].sectionId).toBe(A);
    const y = add('y', A, other);
    expect(items()[y].sectionId).toBeNull();
    const sub = createItem(list, { text: 'sub', parentId: a1, sectionId: A })!;
    expect(items()[sub].sectionId).toBeNull();
  });

  // Bug prevented: pressing Enter on a task in a section creating the next one outside it.
  it('puts a task added after another task into that task’s section', () => {
    const { A, a1 } = sample();
    const next = createItem(list, { text: 'next', after: a1 })!;
    expect(items()[next].sectionId).toBe(A);
    expect(view().A).toEqual(['a1@0', 'next@0', 'a2@0']);
    const first = createItem(list, { text: 'first', after: null })!;
    expect(items()[first].sectionId).toBeNull();
  });

  it('files a task typed with /Section in that section, and keeps the title clean', () => {
    const { A } = sample();
    const id = createItemFromText(list, 'Buy paint /A')!;
    expect(items()[id]).toMatchObject({ text: 'Buy paint', sectionId: A });
    const plain = createItemFromText(list, 'Buy milk', { sectionId: A })!;
    expect(items()[plain].sectionId).toBe(A);
  });

  it('clears the section on indent, and outdent puts the task back in its parent’s section', () => {
    const { A, a1, a2 } = sample();
    expect(indentItem(a2)).toBe(true);
    expect(items()[a2]).toMatchObject({ parentId: a1, sectionId: null });
    expect(outdentItem(a2)).toBe(true);
    expect(items()[a2]).toMatchObject({ parentId: null, sectionId: A });
    expect(view().A).toEqual(['a1@0', 'a2@0']);
  });

  // Bug prevented: indenting the first task of a section under the last task of the section above.
  it('does not indent the first task of a section', () => {
    const { a1 } = sample();
    const before = JSON.stringify(items());
    expect(indentItem(a1)).toBe(false);
    expect(JSON.stringify(items())).toBe(before);
  });

  // Bug prevented: indent picking the task above by sort key across sections, so a task
  // landed under an unsectioned task that is not above it in its own section.
  it('indents under the task above in the same section when sort keys interleave', () => {
    const A = createSection(list, 'A')!;
    const a1 = add('a1', A);
    const u1 = add('u1');
    const a2 = add('a2', A);
    expect(items()[u1].sortKey < items()[a2].sortKey).toBe(true);
    expect(items()[a1].sortKey < items()[u1].sortKey).toBe(true);
    expect(indentItem(a2)).toBe(true);
    expect(items()[a2].parentId).toBe(a1);
  });

  it('moveItem: lands in the chosen section, clears it as a subtask, subtask takes its ancestor’s', () => {
    const { A, B, u1, a1, a2 } = sample();
    moveItem(u1, null, null, B);
    expect(view().B).toEqual(['u1@0', 'b1@0']);
    moveItem(a1, a2, null);
    expect(items()[a1]).toMatchObject({ parentId: a2, sectionId: null });
    moveItem(a1, null, a2);
    expect(items()[a1]).toMatchObject({ parentId: null, sectionId: A });
    moveItem(a1, null, null, null);
    expect(items()[a1].sectionId).toBeNull();
    // Without a section argument a top-level task stays where it is.
    moveItem(a2, null, null);
    expect(items()[a2].sectionId).toBe(A);
  });

  it('moveItemBy crosses to the end of the section above and the start of the one below', () => {
    const { u1, a1, a2, b1 } = sample();
    const B = sectionIds()[1];
    // Inside a section it just swaps.
    expect(moveItemBy(a2, -1)).toBe(true);
    expect(view().A).toEqual(['a2@0', 'a1@0']);
    // First task of A goes up to the end of "no section".
    expect(moveItemBy(a2, -1)).toBe(true);
    expect(view().none).toEqual(['u1@0', 'a2@0']);
    expect(items()[a2].sectionId).toBeNull();
    // First task of the first group has nowhere to go.
    expect(moveItemBy(u1, -1)).toBe(false);
    // Down from the last of "no section" into the start of A.
    expect(moveItemBy(a2, 1)).toBe(true);
    expect(view().A).toEqual(['a2@0', 'a1@0']);
    // Last of A down to the start of B.
    expect(moveItemBy(a1, 1)).toBe(true);
    expect(view()).toMatchObject({ A: ['a2@0'], B: ['a1@0', 'b1@0'] });
    expect(items()[a1].sectionId).toBe(B);
    // Last task of the last group stays put.
    expect(moveItemBy(b1, 1)).toBe(false);
  });

  it('moveItemBy enters a collapsed or empty section', () => {
    const A = createSection(list, 'A')!;
    const B = createSection(list, 'B')!;
    setSectionCollapsed(A, true);
    const x = add('x');
    expect(moveItemBy(x, 1)).toBe(true);
    expect(items()[x].sectionId).toBe(A);
    expect(moveItemBy(x, 1)).toBe(true);
    expect(items()[x].sectionId).toBe(B);
    expect(moveItemBy(x, -1)).toBe(true);
    expect(items()[x].sectionId).toBe(A);
  });

  it('moveItemBy leaves a list with no sections working as before', () => {
    const a = add('a');
    const b = add('b');
    expect(moveItemBy(a, 1)).toBe(true);
    expect(view().none).toEqual(['b@0', 'a@0']);
    expect(moveItemBy(a, 1)).toBe(false);
    expect(moveItemBy(b, -1)).toBe(false);
  });

  it('clears the section when a task moves to another list, singly or in a batch', () => {
    const { a1, a2 } = sample();
    const other = createList({ type: 'todo', title: 'Other' });
    moveItemToList(a1, other);
    expect(items()[a1]).toMatchObject({ listId: other, sectionId: null });
    moveItemsToList([a2], other);
    expect(items()[a2]).toMatchObject({ listId: other, sectionId: null });
  });

  it('duplicates a task into the same section', () => {
    const { A, a1 } = sample();
    const copy = duplicateItem(a1)!;
    expect(items()[copy].sectionId).toBe(A);
    expect(view().A).toEqual(['a1@0', 'a1@0', 'a2@0']);
  });

  // Bug prevented: a duplicated list sharing sections with the original, so editing one changed the other.
  it('duplicates a list with its sections, and repoints the tasks at the copies', () => {
    const { A, a1 } = sample();
    setSectionCollapsed(A, true);
    const copy = duplicateList(list)!;
    const copied = sectionIds(copy);
    expect(copied).toHaveLength(2);
    expect(copied).not.toContain(A);
    expect(sections()[copied[0]]).toMatchObject({ title: 'A', listId: copy, collapsed: true });
    expect(view(copy)).toEqual({ none: ['u1@0'], A: ['a1@0', 'a2@0'], B: ['b1@0'] });
    expect(items()[a1].sectionId).toBe(A);
    expect(sectionIds()).toHaveLength(2);
  });

  it('removes a list’s sections when the list is deleted for good or the Trash is emptied', () => {
    sample();
    const second = createList({ type: 'todo', title: 'Second' });
    createSection(second, 'S');
    deleteList(list);
    expect(Object.keys(sections())).toHaveLength(3);
    deleteListForever(list);
    expect(sectionIds(list)).toEqual([]);
    expect(sectionIds(second)).toHaveLength(1);
    deleteList(second);
    emptyTrash();
    expect(Object.keys(sections())).toHaveLength(0);
  });
});
