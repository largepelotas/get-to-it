import type { Item, Label, List } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { openRows, type DueRow } from './smart';

/*
 * Labels: the pure side. Names, ordering, and the rows for a label's view.
 * The actions that change labels are in actions/labels.ts.
 */

/** A label name as it is stored: no leading @, trimmed, runs of spaces collapsed. May be empty. */
export function normalizeLabelName(name: string): string {
  return name.trim().replace(/^@+/, '').replace(/\s+/g, ' ').trim();
}

/** Whether two names are the same label (ignoring case and spacing). */
export function sameLabelName(a: string, b: string): boolean {
  return normalizeLabelName(a).toLowerCase() === normalizeLabelName(b).toLowerCase();
}

/** Labels in the order the user arranged them. */
export function sortedLabels(labels: Record<string, Label> | Label[]): Label[] {
  return [...(Array.isArray(labels) ? labels : Object.values(labels))].sort(bySortKey);
}

/** The task's labels that still exist, in label order. Ids with no label are ignored. */
export function itemLabels(
  item: Pick<Item, 'labelIds'>,
  labels: Record<string, Label> | Label[],
): Label[] {
  const ids = new Set(item.labelIds ?? []);
  return sortedLabels(labels).filter((l) => ids.has(l.id));
}

/** Every open task carrying the label, from live to-do lists, in the order Today uses. */
export function labelRows(
  items: Record<string, Item>,
  lists: Record<string, List>,
  labelId: string,
): DueRow[] {
  return openRows(items, lists, (i) => (i.labelIds ?? []).includes(labelId));
}

/** How many open tasks carry each label (live to-do lists only), for the sidebar. */
export function labelCounts(
  items: Record<string, Item>,
  lists: Record<string, List>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of openRows(items, lists, (i) => (i.labelIds ?? []).length > 0)) {
    for (const id of new Set(row.item.labelIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
