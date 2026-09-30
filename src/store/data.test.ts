import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import {
  commit,
  flushWrites,
  redo,
  resetForTests,
  undo,
  undoEntry,
  lastEntryId,
  useData,
} from './data';
import { createFolder, deleteFolder } from './actions/folders';
import { createList, deleteList, moveList, renameList, restoreList } from './actions/lists';

let repo: MemoryRepository;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
});

const lists = () => useData.getState().tables.lists;

describe('commit and history', () => {
  it('applies changes, saves them, and undoes/redoes', async () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    expect(lists()[id].title).toBe('Inbox');
    await flushWrites();
    expect((await repo.load()).tables.lists[id]).toBeDefined();

    expect(undo()).toBe('New to-do list');
    expect(lists()[id]).toBeUndefined();
    await flushWrites();
    expect((await repo.load()).tables.lists[id]).toBeUndefined();

    redo();
    expect(lists()[id].title).toBe('Inbox');
  });

  it('merges consecutive edits with the same coalesce key', () => {
    const id = createList({ type: 'todo', title: 'A' });
    renameList(id, 'AB');
    renameList(id, 'ABC');
    expect(useData.getState().past).toHaveLength(2);
    undo();
    expect(lists()[id].title).toBe('A');
  });

  it('skips empty transactions and non-undoable changes', () => {
    commit('Nothing', () => {});
    expect(useData.getState().past).toHaveLength(0);
    const id = createList({ type: 'todo' });
    commit('Quiet', (tx) => void tx.update('lists', id, { showCompleted: false }), {
      undoable: false,
    });
    expect(useData.getState().past).toHaveLength(1);
  });

  it('only undoes a specific entry while it is the newest', () => {
    const id = createList({ type: 'todo' });
    const entry = lastEntryId()!;
    deleteList(id);
    expect(undoEntry(entry)).toBe(false);
    expect(undoEntry(lastEntryId()!)).toBe(true);
    expect(lists()[id].deletedAt).toBeNull();
  });
});

describe('folders and lists', () => {
  it('orders lists and moves them between folders', () => {
    const folder = createFolder('Work');
    const a = createList({ type: 'todo', title: 'A', folderId: folder });
    const b = createList({ type: 'todo', title: 'B', folderId: folder });
    moveList(b, folder, 0);
    const order = Object.values(lists())
      .filter((l) => l.folderId === folder)
      .sort((x, y) => (x.sortKey < y.sortKey ? -1 : 1))
      .map((l) => l.title);
    expect(order).toEqual(['B', 'A']);
    expect(lists()[a].folderId).toBe(folder);
  });

  it('moves lists out when their folder is deleted', () => {
    const folder = createFolder('Work');
    const a = createList({ type: 'todo', folderId: folder });
    deleteFolder(folder);
    expect(lists()[a].folderId).toBeNull();
    expect(useData.getState().tables.folders[folder].deletedAt).not.toBeNull();
  });

  it('creates an empty body for notes and restores deleted lists', () => {
    const note = createList({ type: 'note' });
    expect(useData.getState().tables.notes[note]).toBeDefined();
    deleteList(note);
    expect(lists()[note].deletedAt).not.toBeNull();
    restoreList(note);
    expect(lists()[note].deletedAt).toBeNull();
  });
});
