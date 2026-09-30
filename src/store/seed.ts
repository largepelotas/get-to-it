import { bySortKey } from '@/lib/order';
import { docToPlainText, type RichNode } from '@/lib/richText';
import { insertFolder } from './actions/folders';
import { insertList } from './actions/lists';
import { commit, setSetting, useData } from './data';

const text = (value: string): RichNode => ({ type: 'text', text: value });
const paragraph = (value: string): RichNode => ({ type: 'paragraph', content: [text(value)] });
const bullet = (value: string): RichNode => ({ type: 'listItem', content: [paragraph(value)] });

export function welcomeDoc(): RichNode {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [text('Welcome to Checklist')] },
      paragraph(
        'Checklist keeps your to-do lists, grocery lists and notes in one place, saved on this computer.',
      ),
      {
        type: 'bulletList',
        content: [
          bullet('Make a new list with the + button next to Lists, or group lists into folders.'),
          bullet(
            'In a to-do list, type “Send report friday 3pm p1” to add a task with a date and priority. Press Enter on a task to add one below it, and Tab to make it a subtask.',
          ),
          bullet(
            'In a note, start a line with # for a heading, - for a list or [ ] for a checklist, or use the toolbar.',
          ),
          bullet('Right-click a list or folder to rename it, colour it, pin it or move it.'),
          bullet('Drag lists in the sidebar to reorder them or move them between folders.'),
          bullet('Deleted lists go to the Trash, where you can restore them.'),
          bullet('Undo with ⌘Z on a Mac or Ctrl+Z on Windows.'),
        ],
      },
    ],
  };
}

/**
 * Creates the starter content on first launch: Inbox, Groceries, a Welcome
 * note and a Work folder. Existing data (e.g. after an import) is left alone.
 * Either way it makes sure there's a default list for quick-add.
 */
export function seedIfNeeded(): void {
  const { settings, tables } = useData.getState();
  if (settings.seeded) return;

  const isEmpty = !Object.keys(tables.lists).length && !Object.keys(tables.folders).length;
  let defaultListId = settings.defaultListId;
  if (isEmpty) {
    defaultListId = commit(
      'Welcome',
      (tx) => {
        const inbox = insertList(tx, { type: 'todo', title: 'Inbox', color: 'blue' });
        insertList(tx, { type: 'grocery', title: 'Groceries', color: 'green' });
        const welcome = insertList(tx, { type: 'note', title: 'Welcome' });
        const doc = welcomeDoc();
        tx.update('notes', welcome, {
          content: JSON.stringify(doc),
          plainText: docToPlainText(doc),
        });
        insertFolder(tx, 'Work');
        return inbox;
      },
      { undoable: false },
    );
  } else if (!defaultListId) {
    const firstTodo = Object.values(tables.lists)
      .filter((l) => l.type === 'todo' && !l.deletedAt && !l.archivedAt)
      .sort(bySortKey)[0];
    defaultListId = firstTodo?.id ?? null;
  }
  if (defaultListId !== settings.defaultListId) setSetting('defaultListId', defaultListId);
  setSetting('seeded', true);
}
