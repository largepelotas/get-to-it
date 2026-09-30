import type { ColorName, List, ListType } from '@/data/types';
import { newId } from '@/lib/id';
import { bySortKey } from '@/lib/order';
import { emptyDoc } from '@/lib/richText';
import { commit } from '../data';
import type { Tx } from '../history';
import { keyAt } from './helpers';

export const LIST_TYPE_LABEL: Record<ListType, string> = {
  todo: 'To-do list',
  grocery: 'Grocery list',
  note: 'Note',
};

/** Lists in a folder (or at the top level), in sidebar order. */
function listsIn(tx: Tx, folderId: string | null, exceptId?: string): List[] {
  return tx
    .all('lists')
    .filter(
      (l) =>
        (l.folderId ?? null) === folderId && !l.deletedAt && !l.archivedAt && l.id !== exceptId,
    )
    .sort(bySortKey);
}

export interface NewList {
  type: ListType;
  title?: string;
  folderId?: string | null;
  color?: ColorName | null;
}

/** Adds a list inside an existing transaction and returns its id. */
export function insertList(
  tx: Tx,
  { type, title, folderId = null, color = null }: NewList,
): string {
  const existing = listsIn(tx, folderId);
  const list: List = {
    id: newId(),
    folderId,
    type,
    title: title?.trim() || (type === 'note' ? 'Untitled note' : LIST_TYPE_LABEL[type]),
    color,
    pinned: false,
    sortKey: keyAt(existing, existing.length),
    showCompleted: true,
    archivedAt: null,
    deletedAt: null,
    createdAt: tx.now,
    updatedAt: tx.now,
  };
  tx.put('lists', list);
  if (type === 'note') {
    tx.put('notes', {
      id: list.id,
      content: JSON.stringify(emptyDoc()),
      plainText: '',
      updatedAt: tx.now,
    });
  }
  return list.id;
}

export function createList(list: NewList): string {
  return commit(`New ${LIST_TYPE_LABEL[list.type].toLowerCase()}`, (tx) => insertList(tx, list));
}

export function renameList(id: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  commit('Rename list', (tx) => void tx.update('lists', id, { title: trimmed }), {
    coalesce: `list-title:${id}`,
  });
}

export function setListColor(id: string, color: ColorName | null): void {
  commit('List colour', (tx) => void tx.update('lists', id, { color }));
}

export function setPinned(id: string, pinned: boolean): void {
  commit(pinned ? 'Pin list' : 'Unpin list', (tx) => void tx.update('lists', id, { pinned }));
}

export function setShowCompleted(id: string, showCompleted: boolean): void {
  commit('Show completed', (tx) => void tx.update('lists', id, { showCompleted }), {
    undoable: false,
  });
}

/** Moves a list into a folder (or the top level) at `index` among that folder's lists. */
export function moveList(id: string, folderId: string | null, index: number): void {
  commit('Move list', (tx) => {
    tx.update('lists', id, { folderId, sortKey: keyAt(listsIn(tx, folderId, id), index) });
  });
}

export function moveListToFolder(id: string, folderId: string | null): void {
  commit('Move list', (tx) => {
    const target = listsIn(tx, folderId, id);
    tx.update('lists', id, { folderId, sortKey: keyAt(target, target.length) });
  });
}

export function archiveList(id: string): void {
  commit(
    'Archive list',
    (tx) => void tx.update('lists', id, { archivedAt: tx.now, pinned: false }),
  );
}

export function unarchiveList(id: string): void {
  commit('Unarchive list', (tx) => {
    const list = tx.get('lists', id);
    if (!list) return;
    const folderAlive = list.folderId && !tx.get('folders', list.folderId)?.deletedAt;
    const folderId = folderAlive ? list.folderId : null;
    const target = listsIn(tx, folderId, id);
    tx.update('lists', id, { archivedAt: null, folderId, sortKey: keyAt(target, target.length) });
  });
}

/** Moves a list to the Trash. */
export function deleteList(id: string): void {
  commit('Delete list', (tx) => void tx.update('lists', id, { deletedAt: tx.now, pinned: false }));
}

export function restoreList(id: string): void {
  commit('Restore list', (tx) => {
    const list = tx.get('lists', id);
    if (!list) return;
    const folderAlive = list.folderId && !tx.get('folders', list.folderId)?.deletedAt;
    const folderId = folderAlive ? list.folderId : null;
    const target = listsIn(tx, folderId, id);
    tx.update('lists', id, { deletedAt: null, folderId, sortKey: keyAt(target, target.length) });
  });
}

/** Copies a list and its unfinished items (not completed history). */
export function duplicateList(id: string): string | null {
  return commit('Duplicate list', (tx) => {
    const list = tx.get('lists', id);
    if (!list) return null;
    const siblings = listsIn(tx, list.folderId);
    const at = siblings.findIndex((l) => l.id === id) + 1;
    const copy: List = {
      ...list,
      id: newId(),
      title: `${list.title} copy`,
      pinned: false,
      sortKey: keyAt(siblings, at),
      archivedAt: null,
      deletedAt: null,
      createdAt: tx.now,
      updatedAt: tx.now,
    };
    tx.put('lists', copy);
    const ids = new Map<string, string>();
    const items = tx.all('items').filter((i) => i.listId === id && !i.deletedAt);
    for (const item of items) ids.set(item.id, newId());
    for (const item of items) {
      tx.put('items', {
        ...item,
        id: ids.get(item.id)!,
        listId: copy.id,
        parentId: item.parentId ? (ids.get(item.parentId) ?? null) : null,
        createdAt: tx.now,
        updatedAt: tx.now,
      });
    }
    const note = tx.get('notes', id);
    if (note) tx.put('notes', { ...note, id: copy.id, updatedAt: tx.now });
    return copy.id;
  });
}
