import { docToPlainText, type RichNode } from '@/lib/richText';
import { commit } from '../data';

/**
 * Saves a note's body with its plain text (for search). Typing coalesces, so
 * undo steps back one burst of edits at a time.
 */
export function setNoteContent(listId: string, doc: RichNode): void {
  const content = JSON.stringify(doc);
  commit(
    'Edit note',
    (tx) => {
      if (!tx.get('lists', listId)) return;
      const note = tx.get('notes', listId);
      if (note?.content === content) return;
      const plainText = docToPlainText(doc);
      if (note) tx.update('notes', listId, { content, plainText });
      else tx.put('notes', { id: listId, content, plainText, updatedAt: tx.now });
    },
    { coalesce: `note:${listId}` },
  );
}
