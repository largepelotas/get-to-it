import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, useData } from './data';
import { createItem, setChecked } from './actions/items';
import { createList } from './actions/lists';
import { createSection, moveSection } from './actions/sections';
import { todoModel } from './todo';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'todo', title: 'Tasks' });
});

const model = (listId = list) => {
  const { items, sections } = useData.getState().tables;
  return todoModel(items, listId, sections);
};
const texts = (rows: { item: { text: string } }[]) => rows.map((r) => r.item.text);

describe('todoModel with sections', () => {
  it('gives the unsectioned rows, then each section in order with rows and open counts', () => {
    const A = createSection(list, 'A')!;
    const B = createSection(list, 'B')!;
    createItem(list, { text: 'u1' });
    createItem(list, { text: 'b1', sectionId: B });
    createItem(list, { text: 'a1', sectionId: A });
    const a2 = createItem(list, { text: 'a2', sectionId: A })!;
    createItem(list, { text: 'sub', parentId: a2 });
    const m = model();
    expect(texts(m.unsectioned)).toEqual(['u1']);
    expect(m.sections.map((s) => s.section.title)).toEqual(['A', 'B']);
    expect(texts(m.sections[0].rows)).toEqual(['a1', 'a2', 'sub']);
    expect(m.sections.map((s) => s.openCount)).toEqual([2, 1]);
    expect(texts(m.open)).toEqual(['u1', 'b1', 'a1', 'a2', 'sub']);
    moveSection(B, 0);
    expect(model().sections.map((s) => s.section.title)).toEqual(['B', 'A']);
  });

  // Bug prevented: a finished task vanishing, or showing twice, or reopening outside its section.
  it('shows a completed task only in Completed, and returns it to its section on reopen', () => {
    const A = createSection(list, 'A')!;
    const a1 = createItem(list, { text: 'a1', sectionId: A })!;
    createItem(list, { text: 'a2', sectionId: A });
    setChecked(a1, true);
    let m = model();
    expect(texts(m.sections[0].rows)).toEqual(['a2']);
    expect(m.sections[0].openCount).toBe(1);
    expect(texts(m.done)).toEqual(['a1']);
    expect(useData.getState().tables.items[a1].sectionId).toBe(A);
    setChecked(a1, false);
    m = model();
    expect(texts(m.sections[0].rows)).toEqual(['a1', 'a2']);
    expect(m.doneCount).toBe(0);
  });

  // Bug prevented: a task naming a deleted or foreign section disappearing from the list.
  it('treats a missing section, or one in another list, as no section', () => {
    const other = createList({ type: 'todo', title: 'Other' });
    const foreign = createSection(other, 'Foreign')!;
    const A = createSection(list, 'A')!;
    const gone = createItem(list, { text: 'gone' })!;
    const wrong = createItem(list, { text: 'wrong' })!;
    createItem(list, { text: 'fine', sectionId: A });
    // Write dangling ids straight into the store, as an old export or a bad edit might.
    useData.setState((s) => ({
      tables: {
        ...s.tables,
        items: {
          ...s.tables.items,
          [gone]: { ...s.tables.items[gone], sectionId: 'missing' },
          [wrong]: { ...s.tables.items[wrong], sectionId: foreign },
        },
      },
    }));
    const m = model();
    expect(texts(m.unsectioned)).toEqual(['gone', 'wrong']);
    expect(texts(m.sections[0].rows)).toEqual(['fine']);
    expect(m.sections).toHaveLength(1);
  });

  it('behaves as before for a list with no sections', () => {
    createItem(list, { text: 'a' });
    createItem(list, { text: 'b' });
    const m = model();
    expect(m.sections).toEqual([]);
    expect(texts(m.unsectioned)).toEqual(['a', 'b']);
    expect(m.unsectioned).toEqual(m.open);
  });
});
