import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import {
  commit,
  flushWrites,
  initData,
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
  it('saves the newer write when a listener commits in response to a change', async () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    const stop = useData.subscribe((state) => {
      if (state.tables.lists[id]?.title === 'Renamed') renameList(id, 'Renamed again');
    });
    renameList(id, 'Renamed');
    stop();
    expect(lists()[id].title).toBe('Renamed again');
    await flushWrites();
    expect((await repo.load()).tables.lists[id].title).toBe('Renamed again');
  });

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

describe('loading settings', () => {
  // Bug prevented: a hand-edited layout name reaching the calendar, which then has no layout to draw.
  it('keeps a known calendar layout and falls back to month for anything else', async () => {
    await initData(new MemoryRepository({ settings: { calendarLayout: 'week' } }));
    expect(useData.getState().settings.calendarLayout).toBe('week');
    await initData(new MemoryRepository({ settings: { calendarLayout: 'year' as never } }));
    expect(useData.getState().settings.calendarLayout).toBe('month');
    await initData(new MemoryRepository({ settings: {} }));
    expect(useData.getState().settings.calendarLayout).toBe('month');
  });

  // Bug prevented: data saved before these settings existed loading without defaults.
  it('uses defaults for missing settings and drops unknown view names', async () => {
    await initData(new MemoryRepository({ settings: { theme: 'dark' } }));
    expect(useData.getState().settings).toMatchObject({
      theme: 'dark',
      hiddenViews: [],
      dailyReviewTime: null,
    });
    await initData(
      new MemoryRepository({
        settings: { hiddenViews: ['tomorrow', 'bogus'] as never, dailyReviewTime: '07:00' },
      }),
    );
    expect(useData.getState().settings).toMatchObject({
      hiddenViews: ['tomorrow'],
      dailyReviewTime: '07:00',
    });
  });

  // Bug prevented: a saved sort of a kind this version doesn't know breaking every view.
  it('keeps well-formed view options and the matrix searches, and falls back for the rest', async () => {
    await initData(
      new MemoryRepository({
        settings: {
          viewOptions: {
            upcoming: { sort: 'priority', group: 'label' },
            'label:X': { sort: 'sideways', group: 'date' },
            'list:Y': { sort: 'manual', group: 'default' },
          } as never,
          matrix: { urgent: 'today', important: 'p1' },
        },
      }),
    );
    expect(useData.getState().settings.viewOptions).toEqual({
      upcoming: { sort: 'priority', group: 'label', layout: 'list' },
      'label:X': { sort: 'manual', group: 'date', layout: 'list' },
    });
    expect(useData.getState().settings.matrix).toEqual({ urgent: 'today', important: 'p1' });
    await initData(new MemoryRepository({ settings: { matrix: 'nope' as never } }));
    expect(useData.getState().settings.matrix).toEqual({
      urgent: 'overdue | today',
      important: 'p1 | p2',
    });
  });
});

describe('loading timer lengths', () => {
  // Bug prevented: a stored focus or break length of 0, text, or an absurd number making a
  // timer that ends instantly or never.
  it('falls back to 25 and 5 for invalid lengths and keeps a valid one', async () => {
    for (const bad of [0, '25', 1000, 2.5]) {
      await initData(
        new MemoryRepository({ settings: { focusMinutes: bad, breakMinutes: bad } as never }),
      );
      expect(useData.getState().settings).toMatchObject({ focusMinutes: 25, breakMinutes: 5 });
    }
    await initData(new MemoryRepository({ settings: { focusMinutes: 45 } }));
    expect(useData.getState().settings).toMatchObject({ focusMinutes: 45, breakMinutes: 5 });
  });
});
