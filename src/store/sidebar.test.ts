import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { createFolder, moveFolder, setFolderCollapsed } from './actions/folders';
import { archiveList, createList, deleteList, moveList, setPinned } from './actions/lists';
import { resetForTests, useData } from './data';
import {
  openCounts,
  resolveSidebarDrop,
  rowKey,
  sidebarModel,
  sidebarRows,
  type SidebarDrop,
} from './sidebar';

beforeEach(() => resetForTests(new MemoryRepository()));

const model = () => sidebarModel(useData.getState().tables);
const titles = (rows: { kind: string; id: string }[]) => {
  const { lists, folders } = useData.getState().tables;
  return rows.map((r) => (r.kind === 'folder' ? `[${folders[r.id].name}]` : lists[r.id].title));
};

/** Top-level A, B; folder F with C, D; folder G with E. */
function setup() {
  const a = createList({ type: 'todo', title: 'A' });
  const b = createList({ type: 'todo', title: 'B' });
  const f = createFolder('F');
  const c = createList({ type: 'todo', title: 'C', folderId: f });
  const d = createList({ type: 'note', title: 'D', folderId: f });
  const g = createFolder('G');
  const e = createList({ type: 'grocery', title: 'E', folderId: g });
  return { a, b, c, d, e, f, g };
}

function drop(active: string, over: string): SidebarDrop | null {
  const rows = sidebarRows(model());
  return resolveSidebarDrop(rows, active, over);
}

function apply(result: SidebarDrop | null) {
  if (result?.kind === 'list') moveList(result.id, result.folderId, result.index);
  else if (result?.kind === 'folder') moveFolder(result.id, result.index);
}

describe('sidebarModel', () => {
  it('groups lists, and separates pinned, archived and trashed ones', () => {
    const { a, b, c, d } = setup();
    setPinned(c, true);
    archiveList(b);
    deleteList(d);
    const m = model();
    expect(titles(m.unfiled.map((l) => ({ kind: 'list', id: l.id })))).toEqual(['A']);
    expect(m.folders.map((f) => f.lists.map((l) => l.title))).toEqual([['C'], ['E']]);
    expect(m.pinned.map((l) => l.id)).toEqual([c]);
    expect(m.archived.map((l) => l.id)).toEqual([b]);
    expect(m.trashed.map((l) => l.id)).toEqual([d]);
    expect(m.unfiled[0].id).toBe(a);
  });

  it('shows lists whose folder is gone at the top level', () => {
    const { c, f } = setup();
    const { lists, folders } = useData.getState().tables;
    const { [f]: _gone, ...rest } = folders;
    expect(sidebarModel({ lists, folders: rest }).unfiled.map((l) => l.id)).toContain(c);
  });

  it('counts open items per list', () => {
    const item = (id: string, listId: string, checked = false, deletedAt: number | null = null) =>
      ({ id, listId, checked, deletedAt }) as Item;
    const counts = openCounts({
      1: item('1', 'x'),
      2: item('2', 'x', true),
      3: item('3', 'x', false, 5),
      4: item('4', 'y'),
    });
    expect(counts.get('x')).toBe(1);
    expect(counts.get('y')).toBe(1);
  });
});

describe('sidebarRows', () => {
  it('lists folders after top-level lists and hides collapsed folders’ lists', () => {
    const { f, g } = setup();
    expect(titles(sidebarRows(model()))).toEqual(['A', 'B', '[F]', 'C', 'D', '[G]', 'E']);
    setFolderCollapsed(f, true);
    expect(titles(sidebarRows(model()))).toEqual(['A', 'B', '[F]', '[G]', 'E']);
    expect(titles(sidebarRows(model(), g))).toEqual(['A', 'B', '[F]', '[G]']);
  });
});

describe('resolveSidebarDrop', () => {
  const order = () => titles(sidebarRows(model()));

  it('reorders top-level lists', () => {
    const { a, b } = setup();
    apply(drop(rowKey('list', a), rowKey('list', b)));
    expect(order()).toEqual(['B', 'A', '[F]', 'C', 'D', '[G]', 'E']);
  });

  it('moves a list down into the folder whose header it lands on', () => {
    const { a, f } = setup();
    const result = drop(rowKey('list', a), rowKey('folder', f));
    expect(result).toEqual({ kind: 'list', id: a, folderId: f, index: 0 });
    apply(result);
    expect(order()).toEqual(['B', '[F]', 'A', 'C', 'D', '[G]', 'E']);
  });

  it('moves a list up out of a folder into the one above', () => {
    const { e, g, f } = setup();
    const result = drop(rowKey('list', e), rowKey('folder', g));
    expect(result).toEqual({ kind: 'list', id: e, folderId: f, index: 2 });
    apply(result);
    expect(order()).toEqual(['A', 'B', '[F]', 'C', 'D', 'E', '[G]']);
  });

  it('moves a list to the top level', () => {
    const { a, d } = setup();
    const result = drop(rowKey('list', d), rowKey('list', a));
    expect(result).toEqual({ kind: 'list', id: d, folderId: null, index: 0 });
    apply(result);
    expect(order()).toEqual(['D', 'A', 'B', '[F]', 'C', '[G]', 'E']);
  });

  it('reorders within a folder', () => {
    const { c, d } = setup();
    apply(drop(rowKey('list', d), rowKey('list', c)));
    expect(order()).toEqual(['A', 'B', '[F]', 'D', 'C', '[G]', 'E']);
  });

  it('reorders folders only among folders', () => {
    const { f, e } = setup();
    // Dropping F onto a list in G puts F after G.
    const rows = sidebarRows(model(), f);
    const result = resolveSidebarDrop(rows, rowKey('folder', f), rowKey('list', e));
    expect(result).toEqual({ kind: 'folder', id: f, index: 1 });
    apply(result);
    expect(order()).toEqual(['A', 'B', '[G]', 'E', '[F]', 'C', 'D']);
  });

  it('ignores drops that change nothing', () => {
    const { a, b, f, g } = setup();
    expect(drop(rowKey('list', a), rowKey('list', a))).toBeNull();
    // B dropped onto F's header moving down lands in F; A onto B stays top level.
    expect(drop(rowKey('list', b), rowKey('list', a))).not.toBeNull();
    // A folder dropped onto the last list of the folder above it doesn't move.
    const rows = sidebarRows(model(), g);
    const lastInF = rows.find((r) => r.kind === 'list' && r.folderId === f)!;
    expect(resolveSidebarDrop(rows, rowKey('folder', g), rowKey('list', lastInF.id))).toBeNull();
  });
});
