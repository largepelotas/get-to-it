import type { Item, Tables } from '@/data/types';
import { guessCategory, parseGroceryText } from '@/lib/grocery';
import { bySortKey } from '@/lib/order';
import { commit, useData } from '../data';
import { categoryHistory, groupOf, OTHER_CATEGORY } from '../grocery';
import type { Tx } from '../history';
import { keyAt, listItems } from './helpers';
import { insertItem } from './items';

export function groceryListIds(tables: Tables): Set<string> {
  return new Set(
    Object.values(tables.lists)
      .filter((l) => l.type === 'grocery')
      .map((l) => l.id),
  );
}

/**
 * Adds an item from typed text such as "2 lemons" or "milk 1 l": the
 * quantity is read out of the text, and the category is where the same name
 * was filed before, or a guess from its name.
 */
export function createGroceryItem(listId: string, raw: string): string | null {
  const { name, quantity } = parseGroceryText(raw);
  if (!name) return null;
  const { tables, settings } = useData.getState();
  const history = categoryHistory(tables.items, groceryListIds(tables));
  const category = guessCategory(name, settings.groceryCategories, history);
  return commit('New item', (tx) => insertItem(tx, listId, { text: name, quantity, category }));
}

/** Sets the free-text quantity ("2", "500 g"). Blank clears it. */
export function setQuantity(id: string, quantity: string): void {
  const value = quantity.trim() || null;
  commit('Quantity', (tx) => void tx.update('items', id, { quantity: value }), {
    coalesce: `item-quantity:${id}`,
  });
}

/** A list's live items in order, leaving out `exceptId`. */
function ordered(tx: Tx, listId: string, exceptId: string): Item[] {
  return listItems(tx, listId)
    .filter((i) => i.id !== exceptId)
    .sort(bySortKey);
}

/** The stored category for an item shown in group `groupId`: `null` for Other. */
function categoryFor(item: Item, groupId: string): string | null {
  const categories = useData.getState().settings.groceryCategories;
  // Moving within Other keeps an unknown category, in case it comes back.
  if (groupOf(item, categories).id === groupId) return item.category;
  return groupId === OTHER_CATEGORY.id ? null : groupId;
}

/** Files an item under another category (`null` for Other), at the end of its items there. */
export function setCategory(id: string, category: string | null): void {
  commit('Category', (tx) => {
    const item = tx.get('items', id);
    if (!item || item.category === category) return;
    const categories = useData.getState().settings.groceryCategories;
    const moved = { ...item, category };
    const group = groupOf(moved, categories).id;
    const others = ordered(tx, item.listId, id);
    let last = -1;
    others.forEach((o, i) => {
      if (!o.checked && groupOf(o, categories).id === group) last = i;
    });
    tx.update('items', id, {
      category,
      sortKey: last < 0 ? item.sortKey : keyAt(others, last + 1),
    });
  });
}

export type GroceryPlace = { after: string } | { before: string };

/**
 * Moves an item next to another in the group `groupId` (a category id, or
 * Other's), changing its category if the group is a different one.
 */
export function moveGroceryItem(id: string, groupId: string, place: GroceryPlace): void {
  commit('Move item', (tx) => {
    const item = tx.get('items', id);
    if (!item) return;
    const others = ordered(tx, item.listId, id);
    const anchor = 'after' in place ? place.after : place.before;
    const i = others.findIndex((o) => o.id === anchor);
    if (i < 0) return;
    tx.update('items', id, {
      category: categoryFor(item, groupId),
      sortKey: keyAt(others, 'after' in place ? i + 1 : i),
    });
  });
}

function checkedItems(listId: string): Item[] {
  return Object.values(useData.getState().tables.items).filter(
    (i) => i.listId === listId && i.checked && !i.deletedAt,
  );
}

/** Takes everything out of the cart, to shop from the list again. Returns how many. */
export function uncheckAll(listId: string): number {
  const ids = checkedItems(listId).map((i) => i.id);
  commit('Uncheck all', (tx) => {
    for (const id of ids) tx.update('items', id, { checked: false, completedAt: null });
  });
  return ids.length;
}

/** Removes the items in the cart (to the Trash, so Undo works). Returns how many. */
export function clearChecked(listId: string): number {
  const ids = checkedItems(listId).map((i) => i.id);
  commit('Clear checked', (tx) => {
    for (const id of ids) tx.update('items', id, { deletedAt: tx.now });
  });
  return ids.length;
}
