import { describe, expect, it } from 'vitest';
import type { GroceryCategory, Item } from '@/data/types';
import { categoryHistory, groceryModel } from './grocery';

function item(id: string, fields: Partial<Item> = {}): Item {
  return {
    id,
    listId: 'L',
    parentId: null,
    text: id,
    checked: false,
    completedAt: null,
    sortKey: 'a0',
    collapsed: false,
    details: null,
    dueDate: null,
    dueTime: null,
    priority: 0,
    recurrence: null,
    quantity: null,
    category: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...fields,
  };
}

const byId = (...list: Item[]) => Object.fromEntries(list.map((i) => [i.id, i]));

const categories: GroceryCategory[] = [
  { id: 'dairy', name: 'Dairy' },
  { id: 'produce', name: 'Produce' },
];

describe('groceryModel', () => {
  it('groups open items by category in settings order, then Other', () => {
    const model = groceryModel(
      byId(
        item('Apples', { category: 'produce', sortKey: 'a1' }),
        item('Milk', { category: 'dairy', sortKey: 'a2' }),
        item('Card', { sortKey: 'a3' }),
        item('Lemons', { category: 'produce', sortKey: 'a0' }),
        item('Gone', { category: 'removed', sortKey: 'a4' }),
        item('Butter', { category: 'dairy', sortKey: 'a5' }),
      ),
      'L',
      categories,
    );
    expect(model.groups.map((g) => [g.category.name, g.items.map((i) => i.id)])).toEqual([
      ['Dairy', ['Milk', 'Butter']],
      ['Produce', ['Lemons', 'Apples']],
      ['Other', ['Card', 'Gone']],
    ]);
    expect(model.open.map((i) => i.id)).toEqual([
      'Milk',
      'Butter',
      'Lemons',
      'Apples',
      'Card',
      'Gone',
    ]);
  });

  it('puts checked items in the cart, most recent first, and skips other lists and deleted items', () => {
    const model = groceryModel(
      byId(
        item('Milk', { category: 'dairy', checked: true, completedAt: 1 }),
        item('Eggs', { category: 'dairy', checked: true, completedAt: 3 }),
        item('Bread', { checked: true, completedAt: 2 }),
        item('Deleted', { deletedAt: 5 }),
        item('Elsewhere', { listId: 'M' }),
      ),
      'L',
      categories,
    );
    expect(model.groups).toEqual([]);
    expect(model.cart.map((i) => i.id)).toEqual(['Eggs', 'Bread', 'Milk']);
  });
});

describe('categoryHistory', () => {
  it('remembers the latest category per name across grocery lists, deleted items included', () => {
    const history = categoryHistory(
      byId(
        item('a', { text: 'Tuna', category: 'pantry', updatedAt: 1 }),
        item('b', { text: 'tuna', category: 'meat', updatedAt: 2, listId: 'M', deletedAt: 3 }),
        item('c', { text: 'Tuna', category: 'snacks', updatedAt: 9, listId: 'todo' }),
        item('d', { text: 'Card' }),
      ),
      new Set(['L', 'M']),
    );
    expect([...history]).toEqual([['tuna', 'meat']]);
  });
});
