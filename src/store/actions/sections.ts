import type { Item, Section } from '@/data/types';
import { newId } from '@/lib/id';
import { bySortKey, keyBetween } from '@/lib/order';
import { commit } from '../data';
import type { Tx } from '../history';
import { keyAt, listItems, listSections, sectionOf } from './helpers';

export const UNTITLED_SECTION = 'Untitled section';

/** Top-level tasks of a list (live or in the Trash), in sort order. */
function topLevel(tx: Tx, listId: string): Item[] {
  return tx
    .all('items')
    .filter((i) => i.listId === listId && !i.parentId)
    .sort(bySortKey);
}

/** A sort key past every top-level task of the list: the end of whichever section it joins. */
export function endKey(tx: Tx, listId: string, exceptIds: string[] = []): string {
  const rows = listItems(tx, listId)
    .filter((i) => !i.parentId && !exceptIds.includes(i.id))
    .sort(bySortKey);
  return keyAt(rows, rows.length);
}

/**
 * Adds a section to a to-do list: at the end, or right after the section
 * `after`. Returns its id, or null if the list isn't a to-do list.
 */
export function createSection(
  listId: string,
  title: string,
  options: { after?: string | null } = {},
): string | null {
  return commit('New section', (tx) => {
    const list = tx.get('lists', listId);
    if (!list || list.type !== 'todo') return null;
    const sections = listSections(tx, listId);
    const i = options.after ? sections.findIndex((s) => s.id === options.after) : -1;
    const section: Section = {
      id: newId(),
      listId,
      title: title.trim() || UNTITLED_SECTION,
      sortKey: keyAt(sections, i < 0 ? sections.length : i + 1),
      collapsed: false,
      createdAt: tx.now,
      updatedAt: tx.now,
    };
    tx.put('sections', section);
    return section.id;
  });
}

/** Renames a section. A blank title keeps the old one. */
export function renameSection(id: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  commit('Rename section', (tx) => void tx.update('sections', id, { title: trimmed }));
}

/** Collapses or expands a section. Like collapsing a folder, it isn't an undo step. */
export function setSectionCollapsed(id: string, collapsed: boolean): void {
  commit('Collapse section', (tx) => void tx.update('sections', id, { collapsed }), {
    undoable: false,
  });
}

/** Moves a section to `toIndex` among the list's other sections. */
export function moveSection(id: string, toIndex: number): void {
  commit('Move section', (tx) => {
    const section = tx.get('sections', id);
    if (!section) return;
    const others = listSections(tx, section.listId).filter((s) => s.id !== id);
    tx.update('sections', id, { sortKey: keyAt(others, toIndex) });
  });
}

/** Swaps a section with the one above (-1) or below (1). Returns false at either end. */
export function moveSectionBy(id: string, direction: -1 | 1): boolean {
  return commit('Move section', (tx) => {
    const section = tx.get('sections', id);
    if (!section) return false;
    const all = listSections(tx, section.listId);
    const i = all.findIndex((s) => s.id === id);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= all.length) return false;
    const others = all.filter((s) => s.id !== id);
    tx.update('sections', id, { sortKey: keyAt(others, target) });
    return true;
  });
}

/**
 * Deletes a section. Its tasks stay in the list, unsectioned, after the
 * tasks that were already unsectioned and in their current order.
 */
export function deleteSection(id: string): void {
  commit('Delete section', (tx) => {
    const section = tx.get('sections', id);
    if (!section) return;
    const rows = topLevel(tx, section.listId);
    const orphans = rows.filter((i) => i.sectionId === id);
    const unsectioned = rows.filter((i) => i.sectionId !== id && sectionOf(tx, i) === null);
    let prev: string | null = unsectioned[unsectioned.length - 1]?.sortKey ?? null;
    for (const item of orphans) {
      const sortKey = keyBetween(prev, null);
      prev = sortKey;
      tx.update('items', item.id, { sectionId: null, sortKey });
    }
    tx.remove('sections', id);
  });
}

/**
 * Puts tasks at the end of a section (`null` = no section), in the order
 * given. A subtask is lifted to the top level, unless its parent (or higher
 * ancestor) is also in `ids`, in which case it stays with the parent.
 */
export function moveItemsToSection(ids: string[], sectionId: string | null): void {
  commit(ids.length === 1 ? 'Move task' : 'Move tasks', (tx) => {
    const section = sectionId ? tx.get('sections', sectionId) : undefined;
    if (sectionId && !section) return;
    const chosen = new Set(ids);
    for (const id of ids) {
      const item = tx.get('items', id);
      if (!item || item.deletedAt) continue;
      if (section && item.listId !== section.listId) continue;
      let ancestor = tx.get('items', item.parentId);
      let covered = false;
      for (let guard = 0; ancestor && guard < 50; guard++) {
        if (chosen.has(ancestor.id)) covered = true;
        ancestor = tx.get('items', ancestor.parentId);
      }
      if (covered) continue;
      tx.update('items', id, {
        parentId: null,
        sectionId,
        sortKey: endKey(tx, item.listId, [id]),
      });
    }
  });
}
