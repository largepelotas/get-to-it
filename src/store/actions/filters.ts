import type { ColorName, Filter } from '@/data/types';
import { newId } from '@/lib/id';
import { bySortKey } from '@/lib/order';
import { commit } from '../data';
import type { Tx } from '../history';
import { keyAt } from './helpers';

/*
 * Saved filters. The query isn't checked here: a filter can be saved with a
 * query that names a list that doesn't exist yet, and the view says what's
 * wrong when it's opened. The pure side (rows, counts) is in store/filters.ts.
 */

function filtersInOrder(tx: Tx): Filter[] {
  return tx.all('filters').sort(bySortKey);
}

/** A filter name as stored: trimmed, runs of spaces collapsed. May be empty. */
export const normalizeFilterName = (name: string) => name.trim().replace(/\s+/g, ' ');

export interface NewFilter {
  name: string;
  query: string;
  color?: ColorName | null;
}

/** Adds a filter at the end. Returns its id, or null for a blank name or query. */
export function createFilter({ name, query, color = null }: NewFilter): string | null {
  const title = normalizeFilterName(name);
  const text = query.trim();
  if (!title || !text) return null;
  return commit('New filter', (tx) => {
    const sorted = filtersInOrder(tx);
    const filter: Filter = {
      id: newId(),
      name: title,
      query: text,
      color,
      sortKey: keyAt(sorted, sorted.length),
      createdAt: tx.now,
      updatedAt: tx.now,
    };
    tx.put('filters', filter);
    return filter.id;
  });
}

/** Changes a filter's name and query. A blank name or query is refused. */
export function updateFilter(
  id: string,
  { name, query }: { name: string; query: string },
): boolean {
  const title = normalizeFilterName(name);
  const text = query.trim();
  if (!title || !text) return false;
  return commit('Edit filter', (tx) => {
    const filter = tx.get('filters', id);
    if (!filter) return false;
    if (filter.name !== title || filter.query !== text) {
      tx.update('filters', id, { name: title, query: text });
    }
    return true;
  });
}

/** Renames a filter. Refuses a blank name. */
export function renameFilter(id: string, name: string): boolean {
  const title = normalizeFilterName(name);
  if (!title) return false;
  return commit('Rename filter', (tx) => {
    const filter = tx.get('filters', id);
    if (!filter) return false;
    if (filter.name !== title) tx.update('filters', id, { name: title });
    return true;
  });
}

export function setFilterColor(id: string, color: ColorName | null): void {
  commit('Filter colour', (tx) => void tx.update('filters', id, { color }));
}

/** Swaps a filter with the one above (-1) or below (1). Returns false at either end. */
export function moveFilterBy(id: string, direction: -1 | 1): boolean {
  return commit('Move filter', (tx) => {
    const all = filtersInOrder(tx);
    const i = all.findIndex((f) => f.id === id);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= all.length) return false;
    const others = all.filter((f) => f.id !== id);
    tx.update('filters', id, { sortKey: keyAt(others, target) });
    return true;
  });
}

/** Deletes a filter. Tasks are untouched; there is no trash for filters. */
export function deleteFilter(id: string): void {
  commit('Delete filter', (tx) => {
    if (tx.get('filters', id)) tx.remove('filters', id);
  });
}
