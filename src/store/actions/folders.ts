import type { ColorName, Folder } from '@/data/types';
import { newId } from '@/lib/id';
import { bySortKey } from '@/lib/order';
import { commit } from '../data';
import type { Tx } from '../history';
import { keyAt } from './helpers';

function liveFolders(tx: Tx, exceptId?: string): Folder[] {
  return tx
    .all('folders')
    .filter((f) => !f.deletedAt && f.id !== exceptId)
    .sort(bySortKey);
}

export function createFolder(name: string): string {
  return commit('New folder', (tx) => {
    const folders = liveFolders(tx);
    const folder: Folder = {
      id: newId(),
      name: name.trim() || 'New folder',
      color: null,
      sortKey: keyAt(folders, folders.length),
      collapsed: false,
      createdAt: tx.now,
      updatedAt: tx.now,
      deletedAt: null,
    };
    tx.put('folders', folder);
    return folder.id;
  });
}

export function renameFolder(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  commit('Rename folder', (tx) => void tx.update('folders', id, { name: trimmed }));
}

export function setFolderColor(id: string, color: ColorName | null): void {
  commit('Folder colour', (tx) => void tx.update('folders', id, { color }));
}

export function setFolderCollapsed(id: string, collapsed: boolean): void {
  commit('Collapse folder', (tx) => void tx.update('folders', id, { collapsed }), {
    undoable: false,
  });
}

/** Moves a folder to `index` among the other folders. */
export function moveFolder(id: string, index: number): void {
  commit('Move folder', (tx) => {
    tx.update('folders', id, { sortKey: keyAt(liveFolders(tx, id), index) });
  });
}

/** Deletes a folder. Its lists move out to the top level rather than being deleted. */
export function deleteFolder(id: string): void {
  commit('Delete folder', (tx) => {
    const lists = tx.all('lists');
    const unfiled = lists.filter((l) => !l.folderId && !l.deletedAt).sort(bySortKey);
    const inFolder = lists.filter((l) => l.folderId === id).sort(bySortKey);
    let last = unfiled.length;
    for (const list of inFolder) {
      tx.update('lists', list.id, { folderId: null, sortKey: keyAt(unfiled, last) });
      unfiled.push({ ...list, sortKey: tx.get('lists', list.id)!.sortKey });
      last++;
    }
    tx.update('folders', id, { deletedAt: tx.now });
  });
}
