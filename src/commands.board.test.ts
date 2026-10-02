import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, todayKey } from '@/lib/dates';
import { dropOnColumn, moveTasksToLabel, moveTasksToSection } from './commands';
import { createItem } from './store/actions/items';
import { createLabel, setItemLabels } from './store/actions/labels';
import { createList } from './store/actions/lists';
import { createSection } from './store/actions/sections';
import { redo, resetForTests, undo, useData } from './store/data';

vi.mock('sonner', () => ({ toast: vi.fn() }));

const today = todayKey();
let list: string;
const item = (id: string) => useData.getState().tables.items[id];
const past = () => useData.getState().past.length;

beforeEach(() => {
  vi.mocked(toast).mockClear();
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

// Bug prevented: a card dropped on a section column not moving, moving silently, or not undoing.
describe('moveTasksToSection', () => {
  it('moves a task, toasts, and undoes', () => {
    const s = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'A' })!;
    moveTasksToSection([id], s);
    expect(item(id).sectionId).toBe(s);
    expect(toast).toHaveBeenCalledWith('Moved to Later', expect.anything());
    undo();
    expect(item(id).sectionId ?? null).toBeNull();
    redo();
    expect(item(id).sectionId).toBe(s);
  });

  it('says No section, and counts several tasks as one undo step', () => {
    const s = createSection(list, 'Later')!;
    const a = createItem(list, { text: 'A', sectionId: s })!;
    const b = createItem(list, { text: 'B', sectionId: s })!;
    const n = past();
    moveTasksToSection([a, b], null);
    expect(past()).toBe(n + 1);
    expect(item(a).sectionId ?? null).toBeNull();
    expect(toast).toHaveBeenCalledWith('Moved 2 tasks to No section', expect.anything());
  });

  it('does nothing, with no toast, when the task is already there', () => {
    const s = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'A', sectionId: s })!;
    const loose = createItem(list, { text: 'B' })!;
    const n = past();
    moveTasksToSection([id], s);
    moveTasksToSection([loose], null);
    expect(past()).toBe(n);
    expect(toast).not.toHaveBeenCalled();
  });

  it('leaves subtasks alone', () => {
    const s = createSection(list, 'Later')!;
    const parent = createItem(list, { text: 'P' })!;
    const child = createItem(list, { text: 'C', parentId: parent })!;
    moveTasksToSection([child], s);
    expect(item(child).parentId).toBe(parent);
    expect(toast).not.toHaveBeenCalled();
  });
});

// Bug prevented: a drop between label columns adding the new label but keeping the old one,
// or toasting the wrong thing.
describe('moveTasksToLabel', () => {
  it('swaps the label and toasts', () => {
    const a = createLabel('alpha')!;
    const b = createLabel('beta')!;
    const id = createItem(list, { text: 'A', labelIds: [a] })!;
    moveTasksToLabel([id], a, b);
    expect(item(id).labelIds).toEqual([b]);
    expect(toast).toHaveBeenCalledWith('Moved to beta', expect.anything());
    undo();
    expect(item(id).labelIds).toEqual([a]);
  });

  it('removes the label for No label', () => {
    const a = createLabel('alpha')!;
    const id = createItem(list, { text: 'A', labelIds: [a] })!;
    moveTasksToLabel([id], a, null);
    expect(item(id).labelIds).toEqual([]);
    expect(toast).toHaveBeenCalledWith('Removed label alpha', expect.anything());
  });

  it('counts several tasks in the toast', () => {
    const a = createLabel('alpha')!;
    const b = createLabel('beta')!;
    const ids = [
      createItem(list, { text: 'A', labelIds: [a] })!,
      createItem(list, { text: 'B', labelIds: [a] })!,
    ];
    moveTasksToLabel(ids, a, b);
    expect(toast).toHaveBeenLastCalledWith('Moved 2 tasks to beta', expect.anything());
    moveTasksToLabel(ids, b, null);
    expect(toast).toHaveBeenLastCalledWith('Removed label beta from 2 tasks', expect.anything());
  });

  it('does nothing, with no toast, when nothing changes', () => {
    const a = createLabel('alpha')!;
    const id = createItem(list, { text: 'A', labelIds: [a] })!;
    const n = past();
    moveTasksToLabel([id], null, a);
    moveTasksToLabel([id], null, null);
    expect(past()).toBe(n);
    expect(toast).not.toHaveBeenCalled();
  });
});

// Bug prevented: a column kind whose drop does the wrong change, or nothing.
describe('dropOnColumn', () => {
  it('section', () => {
    const s = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'A' })!;
    dropOnColumn([id], { kind: 'section', sectionId: s }, null);
    expect(item(id).sectionId).toBe(s);
  });

  it('priority', () => {
    const id = createItem(list, { text: 'A' })!;
    dropOnColumn([id], { kind: 'priority', priority: 2 }, null);
    expect(item(id).priority).toBe(2);
  });

  it('date sets a day, and null clears it', () => {
    const tomorrow = addDaysKey(today, 1);
    const id = createItem(list, { text: 'A' })!;
    dropOnColumn([id], { kind: 'date', date: tomorrow }, null);
    expect(item(id).dueDate).toBe(tomorrow);
    dropOnColumn([id], { kind: 'date', date: null }, null);
    expect(item(id).dueDate ?? null).toBeNull();
  });

  it('label swaps out the source column label, and just adds from a non-label source', () => {
    const a = createLabel('alpha')!;
    const b = createLabel('beta')!;
    const id = createItem(list, { text: 'A', labelIds: [a] })!;
    dropOnColumn([id], { kind: 'label', labelId: b }, { kind: 'label', labelId: a });
    expect(item(id).labelIds).toEqual([b]);
    dropOnColumn([id], { kind: 'label', labelId: a }, { kind: 'priority', priority: 1 });
    expect(item(id).labelIds).toEqual([b, a]);
    dropOnColumn([id], { kind: 'label', labelId: null }, { kind: 'label', labelId: b });
    expect(item(id).labelIds).toEqual([a]);
  });

  it('list', () => {
    const other = createList({ type: 'todo', title: 'Other' });
    const id = createItem(list, { text: 'A' })!;
    dropOnColumn([id], { kind: 'list', listId: other }, null);
    expect(item(id).listId).toBe(other);
  });
});

// Bug prevented: the toast counting every dragged task ("Moved 2 tasks to b") when
// only one of a multi-selection actually changed label.
describe('moveTasksToLabel toast count', () => {
  it('counts only the tasks the swap changes', () => {
    const a = createLabel('a')!;
    const b = createLabel('b')!;
    const withA = createItem(list, { text: 'A' })!;
    const withB = createItem(list, { text: 'B' })!;
    setItemLabels(withA, [a]);
    setItemLabels(withB, [b]);
    vi.mocked(toast).mockClear();
    moveTasksToLabel([withA, withB], a, b);
    expect(item(withA).labelIds).toEqual([b]);
    expect(toast).toHaveBeenCalledWith('Moved to b', expect.anything());
  });
});
