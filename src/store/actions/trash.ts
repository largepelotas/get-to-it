import { commit } from '../data';
import type { Tx } from '../history';

/** Permanently removes items with their reminders, completion history and focus sessions. */
function purgeItems(tx: Tx, itemIds: Set<string>): void {
  if (!itemIds.size) return;
  for (const reminder of tx.all('reminders')) {
    if (itemIds.has(reminder.itemId)) tx.remove('reminders', reminder.id);
  }
  for (const completion of tx.all('completions')) {
    if (itemIds.has(completion.itemId)) tx.remove('completions', completion.id);
  }
  for (const session of tx.all('focusSessions')) {
    if (itemIds.has(session.itemId)) tx.remove('focusSessions', session.id);
  }
  for (const id of itemIds) tx.remove('items', id);
}

/** Permanently removes a list and everything in it. */
function purgeList(tx: Tx, listId: string): void {
  const itemIds = new Set(
    tx
      .all('items')
      .filter((i) => i.listId === listId)
      .map((i) => i.id),
  );
  purgeItems(tx, itemIds);
  for (const section of tx.all('sections')) {
    if (section.listId === listId) tx.remove('sections', section.id);
  }
  tx.remove('notes', listId);
  tx.remove('lists', listId);
}

/** Deletes one list in the Trash for good. Not undoable. */
export function deleteListForever(id: string): void {
  commit('Delete forever', (tx) => purgeList(tx, id), { undoable: false });
}

/**
 * Permanently removes everything that has been deleted: lists in the Trash,
 * deleted folders and deleted items. Not undoable.
 */
export function emptyTrash(): void {
  commit(
    'Empty Trash',
    (tx) => {
      const trashed = tx.all('lists').filter((l) => l.deletedAt);
      const trashedIds = new Set(trashed.map((l) => l.id));
      for (const list of trashed) purgeList(tx, list.id);
      purgeItems(
        tx,
        new Set(
          tx
            .all('items')
            .filter((i) => i.deletedAt && !trashedIds.has(i.listId))
            .map((i) => i.id),
        ),
      );
      for (const folder of tx.all('folders')) {
        if (folder.deletedAt) tx.remove('folders', folder.id);
      }
    },
    { undoable: false },
  );
}
