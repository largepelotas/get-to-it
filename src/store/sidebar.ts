import type { Folder, Item, List, Tables } from '@/data/types';
import { bySortKey } from '@/lib/order';

export interface SidebarFolder {
  folder: Folder;
  lists: List[];
}

export interface SidebarModel {
  /** Pinned lists, in sidebar order. They also stay in their normal place. */
  pinned: List[];
  /** Lists outside any folder. */
  unfiled: List[];
  folders: SidebarFolder[];
  archived: List[];
  trashed: List[];
}

/** Everything the sidebar shows, in order. */
export function sidebarModel({ lists, folders }: Pick<Tables, 'lists' | 'folders'>): SidebarModel {
  const liveFolders = Object.values(folders)
    .filter((f) => !f.deletedAt)
    .sort(bySortKey);
  const byFolder = new Map<string | null, List[]>();
  const folderIds = new Set(liveFolders.map((f) => f.id));
  const archived: List[] = [];
  const trashed: List[] = [];
  for (const list of Object.values(lists)) {
    if (list.deletedAt) trashed.push(list);
    else if (list.archivedAt) archived.push(list);
    else {
      // A list whose folder is gone shows at the top level.
      const key = list.folderId && folderIds.has(list.folderId) ? list.folderId : null;
      const bucket = byFolder.get(key);
      if (bucket) bucket.push(list);
      else byFolder.set(key, [list]);
    }
  }
  for (const bucket of byFolder.values()) bucket.sort(bySortKey);
  const unfiled = byFolder.get(null) ?? [];
  const inFolders = liveFolders.map((folder) => ({
    folder,
    lists: byFolder.get(folder.id) ?? [],
  }));
  const pinned = [...unfiled, ...inFolders.flatMap((f) => f.lists)].filter((l) => l.pinned);
  archived.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  trashed.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  return { pinned, unfiled, folders: inFolders, archived, trashed };
}

/** Unchecked, undeleted items per list (subtasks included). */
export function openCounts(items: Record<string, Item>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of Object.values(items)) {
    if (item.checked || item.deletedAt) continue;
    counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
  }
  return counts;
}

/** One draggable row in the sidebar's list tree. */
export type SidebarRow =
  | { kind: 'list'; key: string; id: string; list: List; folderId: string | null }
  | { kind: 'folder'; key: string; id: string; folder: Folder; listCount: number };

export const rowKey = (kind: 'list' | 'folder', id: string) => `${kind}:${id}`;

/**
 * The draggable rows in display order: top-level lists, then each folder
 * followed by its lists. Lists in collapsed folders, and in `hideListsOf`
 * (the folder being dragged), are left out.
 */
export function sidebarRows(model: SidebarModel, hideListsOf?: string | null): SidebarRow[] {
  const listRow = (list: List, folderId: string | null): SidebarRow => ({
    kind: 'list',
    key: rowKey('list', list.id),
    id: list.id,
    list,
    folderId,
  });
  const rows = model.unfiled.map((l) => listRow(l, null));
  for (const { folder, lists } of model.folders) {
    rows.push({
      kind: 'folder',
      key: rowKey('folder', folder.id),
      id: folder.id,
      folder,
      listCount: lists.length,
    });
    if (folder.collapsed || folder.id === hideListsOf) continue;
    for (const list of lists) rows.push(listRow(list, folder.id));
  }
  return rows;
}

export type SidebarDrop =
  | { kind: 'list'; id: string; folderId: string | null; index: number }
  | { kind: 'folder'; id: string; index: number };

function moveRow<T>(rows: T[], from: number, to: number): T[] {
  const next = rows.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** Where a list sits: its folder and its index among that folder's lists. */
function placeOf(rows: SidebarRow[], at: number): { folderId: string | null; index: number } {
  const row = rows[at];
  const prev = rows[at - 1];
  const folderId = !prev ? null : prev.kind === 'folder' ? prev.id : prev.folderId;
  let index = 0;
  for (let i = at - 1; i >= 0 && rows[i].kind === 'list'; i--) {
    if (rows[i].id !== row.id) index++;
  }
  return { folderId, index };
}

/**
 * Works out what dropping `activeKey` onto `overKey` means, following the
 * sortable preview: the dragged row takes the place of the row it's over.
 *
 * - A list joins the folder of the row above its new position (a folder
 *   header or another list); at the very top it leaves any folder.
 * - A folder only changes places with other folders.
 *
 * Returns null when the drop changes nothing.
 */
export function resolveSidebarDrop(
  rows: SidebarRow[],
  activeKey: string,
  overKey: string,
): SidebarDrop | null {
  const from = rows.findIndex((r) => r.key === activeKey);
  const to = rows.findIndex((r) => r.key === overKey);
  if (from < 0 || to < 0 || from === to) return null;
  const active = rows[from];
  const moved = moveRow(rows, from, to);

  if (active.kind === 'folder') {
    const before = rows.filter((r) => r.kind === 'folder').findIndex((r) => r.id === active.id);
    const index = moved.filter((r) => r.kind === 'folder').findIndex((r) => r.id === active.id);
    return index === before ? null : { kind: 'folder', id: active.id, index };
  }

  const was = placeOf(rows, from);
  const now = placeOf(moved, to);
  if (was.folderId === now.folderId && was.index === now.index) return null;
  return { kind: 'list', id: active.id, ...now };
}
