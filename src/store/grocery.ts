import type { GroceryCategory, Item } from '@/data/types';
import { normalizeName } from '@/lib/grocery';
import { bySortKey } from '@/lib/order';

/** The group for items without a category, or with one that was removed. */
export const OTHER_CATEGORY: GroceryCategory = { id: 'other', name: 'Other' };

export interface GroceryGroup {
  category: GroceryCategory;
  /** Open items in list order. */
  items: Item[];
}

export interface GroceryModel {
  /** Categories with open items, in the order of the category settings, then Other. */
  groups: GroceryGroup[];
  /** Checked items, most recently checked first. */
  cart: Item[];
  /** Open items in the order they're shown (group by group). */
  open: Item[];
}

/** The category an item is shown under: its own if it still exists, else Other. */
export function groupOf(item: Item, categories: GroceryCategory[]): GroceryCategory {
  return categories.find((c) => c.id === item.category) ?? OTHER_CATEGORY;
}

/**
 * The sections of a grocery list. Grocery items are flat, so any subtasks
 * (a list can't change type, but imports can hold anything) show as items.
 */
export function groceryModel(
  items: Record<string, Item>,
  listId: string,
  categories: GroceryCategory[],
): GroceryModel {
  const live = Object.values(items)
    .filter((i) => i.listId === listId && !i.deletedAt)
    .sort(bySortKey);
  const byCategory = new Map<string, Item[]>();
  for (const item of live) {
    if (item.checked) continue;
    const id = groupOf(item, categories).id;
    byCategory.set(id, [...(byCategory.get(id) ?? []), item]);
  }
  const groups = [...categories, OTHER_CATEGORY]
    .filter((c) => byCategory.has(c.id))
    .map((category) => ({ category, items: byCategory.get(category.id)! }));
  const cart = live
    .filter((i) => i.checked)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return { groups, cart, open: groups.flatMap((g) => g.items) };
}

/**
 * Where each item name was filed last, across every grocery list (deleted
 * items included, since cleared items are the best record), keyed by
 * `normalizeName`.
 */
export function categoryHistory(
  items: Record<string, Item>,
  groceryListIds: ReadonlySet<string>,
): Map<string, string> {
  const latest = new Map<string, { category: string; at: number }>();
  for (const item of Object.values(items)) {
    if (!item.category || !groceryListIds.has(item.listId)) continue;
    const key = normalizeName(item.text);
    const seen = latest.get(key);
    if (!seen || item.updatedAt > seen.at) {
      latest.set(key, { category: item.category, at: item.updatedAt });
    }
  }
  return new Map([...latest].map(([k, v]) => [k, v.category]));
}
