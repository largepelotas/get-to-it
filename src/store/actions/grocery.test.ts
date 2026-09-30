import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, setSetting, undo, useData } from '../data';
import { groceryModel } from '../grocery';
import {
  clearChecked,
  createGroceryItem,
  moveGroceryItem,
  setCategory,
  setQuantity,
  uncheckAll,
} from './grocery';
import { setChecked } from './items';
import { createList } from './lists';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  list = createList({ type: 'grocery', title: 'Groceries' });
});

const items = () => useData.getState().tables.items;
const model = () => groceryModel(items(), list, useData.getState().settings.groceryCategories);
/** Groups as `Category: item, item`. */
const groups = () =>
  model().groups.map((g) => `${g.category.name}: ${g.items.map((i) => i.text).join(', ')}`);
const cart = () => model().cart.map((i) => i.text);
const add = (text: string) => createGroceryItem(list, text)!;

describe('createGroceryItem', () => {
  it('reads the quantity and guesses the category', () => {
    const id = add('2 lemons');
    expect(items()[id]).toMatchObject({ text: 'lemons', quantity: '2', category: 'produce' });
    add('milk 1 l');
    add('Birthday card');
    expect(groups()).toEqual(['Produce: lemons', 'Dairy & eggs: milk', 'Other: Birthday card']);
  });

  it('files a name where it went before, in any grocery list', () => {
    const other = createList({ type: 'grocery', title: 'Party' });
    const tuna = createGroceryItem(other, 'Tuna')!;
    expect(items()[tuna].category).toBe('pantry');
    setCategory(tuna, 'meat');
    const again = add('tuna');
    expect(items()[again].category).toBe('meat');
  });

  it('ignores blank text', () => {
    expect(createGroceryItem(list, '   ')).toBeNull();
  });
});

describe('editing items', () => {
  it('sets and clears the quantity, coalescing typing into one undo step', () => {
    const id = add('Lemons');
    setQuantity(id, '3');
    setQuantity(id, '3 bags ');
    expect(items()[id].quantity).toBe('3 bags');
    setQuantity(id, ' ');
    expect(items()[id].quantity).toBeNull();
    undo();
    expect(items()[id].quantity).toBeNull();
    expect(useData.getState().past.map((e) => e.label)).toEqual(['New grocery list', 'New item']);
  });

  it('moves an item to the end of its new category', () => {
    add('Milk');
    add('Butter');
    const card = add('Birthday card');
    setCategory(card, 'dairy');
    expect(groups()).toEqual(['Dairy & eggs: Milk, Butter, Birthday card']);
    setCategory(card, null);
    expect(groups()).toEqual(['Dairy & eggs: Milk, Butter', 'Other: Birthday card']);
  });

  it('shows items in a removed category under Other', () => {
    add('Milk');
    setSetting(
      'groceryCategories',
      useData.getState().settings.groceryCategories.filter((c) => c.id !== 'dairy'),
    );
    expect(groups()).toEqual(['Other: Milk']);
  });
});

describe('moveGroceryItem', () => {
  it('reorders within a category', () => {
    const milk = add('Milk');
    add('Lemons');
    const butter = add('Butter');
    add('Eggs');
    moveGroceryItem(butter, 'dairy', { before: milk });
    expect(groups()).toEqual(['Produce: Lemons', 'Dairy & eggs: Butter, Milk, Eggs']);
    moveGroceryItem(butter, 'dairy', { after: milk });
    expect(groups()).toEqual(['Produce: Lemons', 'Dairy & eggs: Milk, Butter, Eggs']);
  });

  it('changes the category when dropped into another group', () => {
    const milk = add('Milk');
    const lemons = add('Lemons');
    moveGroceryItem(milk, 'produce', { after: lemons });
    expect(items()[milk].category).toBe('produce');
    expect(groups()).toEqual(['Produce: Lemons, Milk']);
    moveGroceryItem(lemons, 'other', { after: milk });
    expect(items()[lemons].category).toBeNull();
  });
});

describe('the cart', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('unchecks everything in one undoable step', () => {
    const milk = add('Milk');
    const eggs = add('Eggs');
    add('Bread');
    setChecked(milk, true);
    vi.setSystemTime(Date.now() + 1000);
    setChecked(eggs, true);
    expect(cart()).toEqual(['Eggs', 'Milk']);
    expect(uncheckAll(list)).toBe(2);
    expect(cart()).toEqual([]);
    expect(items()[milk].completedAt).toBeNull();
    undo();
    expect(cart()).toEqual(['Eggs', 'Milk']);
  });

  it('clears checked items to the Trash, with undo', () => {
    const milk = add('Milk');
    add('Bread');
    setChecked(milk, true);
    expect(clearChecked(list)).toBe(1);
    expect(cart()).toEqual([]);
    expect(items()[milk].deletedAt).not.toBeNull();
    expect(groups()).toEqual(['Bakery: Bread']);
    undo();
    expect(cart()).toEqual(['Milk']);
  });

  it('does nothing when the cart is empty', () => {
    add('Milk');
    const before = useData.getState().past.length;
    expect(uncheckAll(list)).toBe(0);
    expect(clearChecked(list)).toBe(0);
    expect(useData.getState().past.length).toBe(before);
  });
});
