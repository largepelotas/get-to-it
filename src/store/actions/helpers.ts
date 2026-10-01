import type { Item, Section } from '@/data/types';
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

/** A list's sections, in order, from inside a transaction. */
export function listSections(tx: Tx, listId: string): Section[] {
  return tx
    .all('sections')
    .filter((s) => s.listId === listId)
    .sort(bySortKey);
}

/**
 * The section a top-level task is really in: its `sectionId` if that names a
 * section of the same list, else null. (A subtask is always null.)
 */
export function sectionOf(tx: Tx, item: Item): string | null {
  if (item.parentId || !item.sectionId) return null;
  return tx.get('sections', item.sectionId)?.listId === item.listId ? item.sectionId : null;
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
