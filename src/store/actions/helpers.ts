import type { Item } from '@/data/types';
import { bySortKey, keyBetween } from '@/lib/order';
import type { Tx } from '../history';
import { childrenIndex } from '../tree';

/** A sort key that puts a row at `index` among already-sorted siblings. */
export function keyAt(sorted: { sortKey: string }[], index: number): string {
  const i = Math.max(0, Math.min(index, sorted.length));
  return keyBetween(sorted[i - 1]?.sortKey ?? null, sorted[i]?.sortKey ?? null);
}

/** Live (not deleted) items of a list, from inside a transaction. */
export function listItems(tx: Tx, listId: string): Item[] {
  return tx.all('items').filter((i) => i.listId === listId && !i.deletedAt);
}

export function siblings(
  tx: Tx,
  listId: string,
  parentId: string | null,
  exceptId?: string,
): Item[] {
  return listItems(tx, listId)
    .filter((i) => (i.parentId ?? null) === parentId && i.id !== exceptId)
    .sort(bySortKey);
}

export function itemIndex(tx: Tx, listId: string) {
  return childrenIndex(listItems(tx, listId));
}
