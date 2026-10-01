import { describe, expect, it } from 'vitest';
import type { Item } from '@/data/types';
import { buildTree, flatten, projectDrop } from './tree';

function item(id: string, parentId: string | null, sortKey: string): Item {
  return {
    id,
    listId: 'L',
    parentId,
    text: id,
    checked: false,
    wontDo: false,
    sectionId: null,
    labelIds: [],
    completedAt: null,
    sortKey,
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
  };
}

// A
//   A1
//   A2
// B
// C
const items = [
  item('A', null, 'a0'),
  item('A1', 'A', 'a0'),
  item('A2', 'A', 'a1'),
  item('B', null, 'a1'),
  item('C', null, 'a2'),
];
const rows = flatten(buildTree(items));

describe('tree', () => {
  it('flattens depth-first with child counts', () => {
    expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['A', 0],
      ['A1', 1],
      ['A2', 1],
      ['B', 0],
      ['C', 0],
    ]);
    expect(rows[0].childCount).toBe(2);
  });

  it('treats orphaned subtasks as top level', () => {
    const tree = buildTree([item('X', 'missing', 'a0')]);
    expect(tree.map((n) => n.item.id)).toEqual(['X']);
  });
});

describe('projectDrop', () => {
  it('reorders at the same level', () => {
    expect(projectDrop(rows, 'C', 'B', 0, 24)).toEqual({
      parentId: null,
      index: 1,
      afterId: 'A',
      depth: 0,
    });
  });

  it('nests when dragged right under a row', () => {
    expect(projectDrop(rows, 'C', 'B', 30, 24)).toEqual({
      parentId: 'A',
      index: 2,
      afterId: 'A2',
      depth: 1,
    });
  });

  it('keeps a row inside a group when it lands between siblings', () => {
    // B dropped onto A2 (moving up) sits between A1 and A2.
    expect(projectDrop(rows, 'B', 'A2', 0, 24)).toEqual({
      parentId: 'A',
      index: 1,
      afterId: 'A1',
      depth: 1,
    });
  });

  it('lands as the first child with no sibling before it', () => {
    // C dropped onto A1 (moving up) and dragged right sits under A, before A1.
    expect(projectDrop(rows, 'C', 'A1', 24, 24)).toEqual({
      parentId: 'A',
      index: 0,
      afterId: null,
      depth: 1,
    });
  });

  it('refuses to drop a row into its own subtree', () => {
    expect(projectDrop(rows, 'A', 'A1', 0, 24)).toBeNull();
  });

  it('moves a whole group down', () => {
    expect(projectDrop(rows, 'A', 'C', 0, 24)).toEqual({
      parentId: null,
      index: 2,
      afterId: 'C',
      depth: 0,
    });
  });
});
