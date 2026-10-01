// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { SqliteRepository, type SqlExecutor } from './sqlite';
import { emptyTables, type Item, type List } from './types';

// node:sqlite mirrors the Rust executor: the same SQL, run in a transaction.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

function nodeExecutor(): SqlExecutor & { raw: InstanceType<typeof DatabaseSync> } {
  const db = new DatabaseSync(':memory:');
  const toParam = (v: unknown) => (typeof v === 'boolean' ? Number(v) : (v as never));
  return {
    raw: db,
    async select(sql, params = []) {
      return db.prepare(sql).all(...params.map(toParam)) as Record<string, unknown>[];
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(...s.params.map(toParam));
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

const list: List = {
  id: 'L1',
  folderId: null,
  type: 'todo',
  title: 'Inbox',
  color: 'blue',
  pinned: true,
  sortKey: 'a0',
  showCompleted: false,
  archivedAt: null,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 2,
};

const item: Item = {
  id: 'I1',
  listId: 'L1',
  parentId: null,
  text: 'Write plan',
  checked: false,
  completedAt: null,
  sortKey: 'a0',
  collapsed: false,
  details: null,
  dueDate: '2026-10-01',
  dueTime: '09:30',
  priority: 2,
  recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3], mode: 'schedule' },
  quantity: null,
  category: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
};

describe('SqliteRepository', () => {
  it('migrates an empty database and loads nothing', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(data.tables.items).toEqual({});
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(1);
  });

  it('round-trips rows and settings', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    await repo.write([
      { kind: 'put', table: 'lists', row: list },
      { kind: 'put', table: 'items', row: item },
      { kind: 'setting', key: 'theme', value: 'dark' },
    ]);
    const data = await new SqliteRepository(exec).load();
    expect(data.tables.lists.L1).toEqual(list);
    expect(data.tables.items.I1).toEqual(item);
    expect(data.settings.theme).toBe('dark');
  });

  it('deletes rows and leaves a tombstone', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    await repo.write([{ kind: 'put', table: 'items', row: item }]);
    await repo.write([{ kind: 'delete', table: 'items', id: 'I1' }]);
    expect((await repo.load()).tables.items).toEqual({});
    const tombstones = await exec.select('SELECT entity, id FROM tombstones');
    expect(tombstones).toEqual([{ entity: 'items', id: 'I1' }]);
  });

  it('applies nothing when a write fails', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    await repo.load();
    const bad = { ...list, id: 'L2', type: 'bogus' } as unknown as List;
    await expect(
      repo.write([
        { kind: 'put', table: 'lists', row: list },
        { kind: 'put', table: 'lists', row: bad },
      ]),
    ).rejects.toThrow();
    expect((await repo.load()).tables.lists).toEqual({});
  });

  it('replaces everything, tombstoning rows that are gone', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    await repo.write([
      { kind: 'put', table: 'lists', row: list },
      { kind: 'put', table: 'items', row: item },
      { kind: 'setting', key: 'theme', value: 'dark' },
    ]);
    const other = { ...list, id: 'L2', title: 'Other' };
    const tables = emptyTables();
    tables.lists = { L1: { ...list, title: 'Renamed' }, L2: other };
    await repo.replaceAll({ tables, settings: { weekStartsOn: 0 } });
    const data = await repo.load();
    expect(Object.keys(data.tables.lists).sort()).toEqual(['L1', 'L2']);
    expect(data.tables.lists.L1.title).toBe('Renamed');
    expect(data.tables.items).toEqual({});
    expect(data.settings).toEqual({ weekStartsOn: 0 });
    const tombstones = await exec.select('SELECT entity, id FROM tombstones');
    expect(tombstones).toEqual([{ entity: 'items', id: 'I1' }]);
  });
});
