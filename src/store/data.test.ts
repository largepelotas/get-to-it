import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import {
  commit,
  flushWrites,
  hasUnsavedChanges,
  initData,
  redo,
  replaceData,
  resetForTests,
  undo,
  undoEntry,
  lastEntryId,
  useData,
} from './data';
import { createFolder, deleteFolder } from './actions/folders';
import {
  createList,
  deleteList,
  moveList,
  renameList,
  restoreList,
  setShowCompleted,
} from './actions/lists';
import { emptyTables } from '@/data/types';

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

describe('undo next to changes outside history', () => {
  it('puts back only what the undone step changed', async () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    renameList(id, 'Work');
    // Not undoable, and made after the rename.
    setShowCompleted(id, false);
    expect(lists()[id].showCompleted).toBe(false);

    undo();
    expect(lists()[id].title).toBe('Inbox');
    expect(lists()[id].showCompleted).toBe(false);
    await flushWrites();
    expect((await repo.load()).tables.lists[id]).toMatchObject({
      title: 'Inbox',
      showCompleted: false,
    });

    setShowCompleted(id, true);
    redo();
    expect(lists()[id]).toMatchObject({ title: 'Work', showCompleted: true });
  });

  it('still removes a row when its creation is undone, and brings it back whole', () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    setShowCompleted(id, false);
    undo();
    expect(lists()[id]).toBeUndefined();
    redo();
    expect(lists()[id].title).toBe('Inbox');
  });
});

describe('saving that fails', () => {
  /** Fails every write until `heal` is called. */
  class FlakyRepository extends MemoryRepository {
    failing = true;
    attempts = 0;
    override async write(ops: Parameters<MemoryRepository['write']>[0]): Promise<void> {
      this.attempts++;
      if (this.failing) throw new Error('disk full');
      return super.write(ops);
    }
  }
  let flaky: FlakyRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    flaky = new FlakyRepository();
    resetForTests(flaky);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the changes and keeps trying until they are saved', async () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    await flushWrites();
    expect(useData.getState().saveError).toBe('disk full');
    expect(hasUnsavedChanges()).toBe(true);

    // Each retry waits longer, and none of them gives up.
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(flaky.attempts).toBe(4);
    expect(hasUnsavedChanges()).toBe(true);

    flaky.failing = false;
    await vi.advanceTimersByTimeAsync(16000);
    expect(hasUnsavedChanges()).toBe(false);
    expect(useData.getState().saveError).toBeNull();
    expect((await flaky.load()).tables.lists[id].title).toBe('Inbox');
  });

  it('saves a newer edit to the same row rather than the one that failed', async () => {
    const id = createList({ type: 'todo', title: 'Inbox' });
    await flushWrites();
    renameList(id, 'Work');
    flaky.failing = false;
    await flushWrites();
    expect((await flaky.load()).tables.lists[id].title).toBe('Work');
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('keeps the warning while an earlier failed batch is still waiting', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const write = vi.spyOn(flaky, 'write');
    // The first batch fails only once the second is already in line behind it.
    write.mockImplementationOnce(async () => {
      await held;
      throw new Error('disk full');
    });
    flaky.failing = false;
    const first = createList({ type: 'todo', title: 'First' });
    void flushWrites();
    const second = createList({ type: 'todo', title: 'Second' });
    const done = flushWrites();
    release();
    await done;

    const saved = (await flaky.load()).tables.lists;
    expect(saved[second]).toBeDefined();
    expect(saved[first]).toBeUndefined();
    expect(useData.getState().saveError).toBe('disk full');
    expect(hasUnsavedChanges()).toBe(true);

    await flushWrites();
    expect((await flaky.load()).tables.lists[first]).toBeDefined();
    expect(useData.getState().saveError).toBeNull();
  });

  it('does not write old rows over data that replaced them', async () => {
    flaky.failing = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const replaceAll = flaky.replaceAll.bind(flaky);
    vi.spyOn(flaky, 'replaceAll').mockImplementation(async (data) => {
      await held;
      return replaceAll(data);
    });
    const replacing = replaceData({ tables: emptyTables(), settings: {} });
    await Promise.resolve();
    // A change made while the replacement is still being written.
    const id = createList({ type: 'todo', title: 'Late' });
    void flushWrites();
    release();
    await replacing;
    await flushWrites();

    expect((await flaky.load()).tables.lists[id]).toBeUndefined();
    expect(lists()[id]).toBeUndefined();
    expect(hasUnsavedChanges()).toBe(false);
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

  // Bug prevented: a user with a removed palette saved (sage) opening the app on Graphite.
  it('loads a palette saved under an old name as its replacement', async () => {
    await initData(new MemoryRepository({ settings: { palette: 'sage' as never } }));
    expect(useData.getState().settings.palette).toBe('moss');
    await initData(new MemoryRepository({ settings: { palette: 'bogus' as never } }));
    expect(useData.getState().settings.palette).toBe('graphite');
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
