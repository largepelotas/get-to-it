import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Completion, Item, Reminder } from '@/data/types';
import { commit, flushWrites, resetForTests, undo, useData } from '../data';
import { createFolder, deleteFolder } from './folders';
import { createList, deleteList, renameList } from './lists';
import { deleteListForever, emptyTrash } from './trash';

let repo: MemoryRepository;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
});

const tables = () => useData.getState().tables;

function addItem(listId: string, id: string, deletedAt: number | null = null): void {
  commit('Add item', (tx) => {
    tx.put('items', { id, listId, parentId: null, deletedAt } as Item);
    tx.put('reminders', { id: `r-${id}`, itemId: id } as Reminder);
    tx.put('completions', { id: `c-${id}`, itemId: id } as Completion);
  });
}

describe('deleteListForever', () => {
  it('removes the list with its items, reminders, completions and note', async () => {
    const note = createList({ type: 'note', title: 'N' });
    const keep = createList({ type: 'todo', title: 'Keep' });
    addItem(note, 'i1');
    addItem(keep, 'i2');
    deleteList(note);
    deleteListForever(note);

    const t = tables();
    expect(t.lists[note]).toBeUndefined();
    expect(t.notes[note]).toBeUndefined();
    expect(t.items.i1).toBeUndefined();
    expect(t.reminders['r-i1']).toBeUndefined();
    expect(t.completions['c-i1']).toBeUndefined();
    expect(t.items.i2).toBeDefined();
    expect(t.reminders['r-i2']).toBeDefined();

    await flushWrites();
    expect((await repo.load()).tables.lists[note]).toBeUndefined();
  });

  it('drops undo steps for the removed rows but keeps the rest', () => {
    const doomed = createList({ type: 'todo', title: 'Doomed' });
    const other = createList({ type: 'todo', title: 'Other' });
    renameList(other, 'Renamed');
    deleteList(doomed);
    deleteListForever(doomed);

    const labels = useData.getState().past.map((e) => e.label);
    expect(labels).toEqual(['New to-do list', 'Rename list']);
    expect(undo()).toBe('Rename list');
    expect(tables().lists[doomed]).toBeUndefined();
  });
});

describe('emptyTrash', () => {
  it('removes trashed lists, deleted items and deleted folders', () => {
    const live = createList({ type: 'todo', title: 'Live' });
    const trashed = createList({ type: 'todo', title: 'Trashed' });
    const folder = createFolder('Old');
    addItem(live, 'kept');
    addItem(live, 'gone', 123);
    addItem(trashed, 'inTrashed');
    deleteList(trashed);
    deleteFolder(folder);
    emptyTrash();

    const t = tables();
    expect(Object.keys(t.lists)).toEqual([live]);
    expect(Object.keys(t.items)).toEqual(['kept']);
    expect(Object.keys(t.reminders)).toEqual(['r-kept']);
    expect(t.folders[folder]).toBeUndefined();
    expect(useData.getState().past.map((e) => e.label)).toEqual(['New to-do list', 'Add item']);
  });
});
