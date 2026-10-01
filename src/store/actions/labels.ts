import type { ColorName, Label } from '@/data/types';
import { newId } from '@/lib/id';
import { bySortKey } from '@/lib/order';
import { commit } from '../data';
import type { Tx } from '../history';
import { normalizeLabelName, sameLabelName } from '../labels';
import { keyAt } from './helpers';

export { itemLabels } from '../labels';

function labelsInOrder(tx: Tx): Label[] {
  return tx.all('labels').sort(bySortKey);
}

/**
 * Finds the label with this name (any case), or makes it at the end, inside an
 * existing transaction. Returns its id, or null for a blank name.
 */
export function ensureLabel(
  tx: Tx,
  rawName: string,
  color: ColorName | null = null,
): string | null {
  const name = normalizeLabelName(rawName);
  if (!name) return null;
  const existing = tx.all('labels').find((l) => sameLabelName(l.name, name));
  if (existing) return existing.id;
  const sorted = labelsInOrder(tx);
  const label: Label = {
    id: newId(),
    name,
    color,
    sortKey: keyAt(sorted, sorted.length),
    createdAt: tx.now,
    updatedAt: tx.now,
  };
  tx.put('labels', label);
  return label.id;
}

/**
 * Adds a label at the end. A name already in use (any case) returns that
 * label's id and changes nothing; a blank one returns null.
 */
export function createLabel(
  name: string,
  options: { color?: ColorName | null } = {},
): string | null {
  return commit('New label', (tx) => ensureLabel(tx, name, options.color ?? null));
}

/** Renames a label. Refuses a blank name or one another label has. */
export function renameLabel(id: string, name: string): boolean {
  const next = normalizeLabelName(name);
  if (!next) return false;
  return commit('Rename label', (tx) => {
    const label = tx.get('labels', id);
    if (!label) return false;
    const clash = tx.all('labels').some((l) => l.id !== id && sameLabelName(l.name, next));
    if (clash) return false;
    if (label.name !== next) tx.update('labels', id, { name: next });
    return true;
  });
}

export function setLabelColor(id: string, color: ColorName | null): void {
  commit('Label colour', (tx) => void tx.update('labels', id, { color }));
}

/** Swaps a label with the one above (-1) or below (1). Returns false at either end. */
export function moveLabelBy(id: string, direction: -1 | 1): boolean {
  return commit('Move label', (tx) => {
    const all = labelsInOrder(tx);
    const i = all.findIndex((l) => l.id === id);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= all.length) return false;
    const others = all.filter((l) => l.id !== id);
    tx.update('labels', id, { sortKey: keyAt(others, target) });
    return true;
  });
}

/** Deletes a label and takes it off every task, as one undo step. */
export function deleteLabel(id: string): void {
  commit('Delete label', (tx) => {
    if (!tx.get('labels', id)) return;
    for (const item of tx.all('items')) {
      if (item.labelIds?.includes(id)) {
        tx.update('items', item.id, { labelIds: item.labelIds.filter((l) => l !== id) });
      }
    }
    tx.remove('labels', id);
  });
}

/** Whether a task can carry labels: it exists and sits in a to-do list. */
function canLabel(tx: Tx, itemId: string): boolean {
  const item = tx.get('items', itemId);
  return !!item && tx.get('lists', item.listId)?.type === 'todo';
}

/** Replaces one task's labels. Unknown ids and repeats are dropped. */
export function setItemLabels(id: string, labelIds: string[]): void {
  commit('Labels', (tx) => {
    if (!canLabel(tx, id)) return;
    const next = [...new Set(labelIds)].filter((l) => tx.get('labels', l));
    const current = tx.get('items', id)!.labelIds ?? [];
    if (next.length === current.length && next.every((l, i) => l === current[i])) return;
    tx.update('items', id, { labelIds: next });
  });
}

/**
 * Makes a label (or finds the one with that name) and puts it on every one of
 * the tasks, as one undo step. Returns its id, or null for a blank name.
 */
export function createLabelOnItems(ids: string[], rawName: string): string | null {
  return commit('Labels', (tx) => {
    const labelId = ensureLabel(tx, rawName);
    if (!labelId) return null;
    for (const id of ids) {
      if (!canLabel(tx, id)) continue;
      const current = tx.get('items', id)!.labelIds ?? [];
      if (!current.includes(labelId)) tx.update('items', id, { labelIds: [...current, labelId] });
    }
    return labelId;
  });
}

/**
 * If every one of the tasks has the label, takes it off them all; otherwise
 * puts it on those that lack it. One undo step.
 */
export function toggleLabelOnItems(ids: string[], labelId: string): void {
  commit('Labels', (tx) => {
    if (!tx.get('labels', labelId)) return;
    const items = ids.filter((id) => canLabel(tx, id)).map((id) => tx.get('items', id)!);
    if (!items.length) return;
    const all = items.every((i) => i.labelIds?.includes(labelId));
    for (const item of items) {
      const current = item.labelIds ?? [];
      if (all) tx.update('items', item.id, { labelIds: current.filter((l) => l !== labelId) });
      else if (!current.includes(labelId)) {
        tx.update('items', item.id, { labelIds: [...current, labelId] });
      }
    }
  });
}
