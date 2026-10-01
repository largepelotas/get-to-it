// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SqliteRepository, type SqlExecutor } from './sqlite';
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
  wontDo: false,
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
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(3);
  });

  it('adds the won’t-do column to a database made before it existed', async () => {
    const exec = nodeExecutor();
    // A version 1 database, as the first release made it.
    const [first] = MIGRATIONS;
    exec.raw.exec('BEGIN');
    for (const sql of first) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 1');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 1, 'a0', 1, 1)`,
    );
    const data = await new SqliteRepository(exec).load();
    expect(data.tables.items.OLD).toMatchObject({ checked: true, wontDo: false });
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(MIGRATIONS.length);
  });

  // Bug prevented: an upgrade losing reminders, or leaving old ones unreadable without the new column.
  it('adds the constant column to a version 2 database, keeping its reminders ordinary', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of [...MIGRATIONS[0], ...MIGRATIONS[1]]) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 2');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO reminders (id, item_id, kind, offset_minutes, created_at, updated_at)
       VALUES ('R1', 'I1', 'relative', 15, 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(data.tables.reminders.R1).toMatchObject({ offsetMinutes: 15, constant: false });
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(3);
    await repo.write([
      { kind: 'put', table: 'reminders', row: { ...data.tables.reminders.R1, constant: true } },
    ]);
    expect((await new SqliteRepository(exec).load()).tables.reminders.R1.constant).toBe(true);
  });

  it('keeps a task closed as won’t do', async () => {
    const exec = nodeExecutor();
    const repo = new SqliteRepository(exec);
    await repo.write([
      { kind: 'put', table: 'items', row: { ...item, checked: true, wontDo: true } },
    ]);
    const data = await new SqliteRepository(exec).load();
    expect(data.tables.items.I1).toMatchObject({ checked: true, wontDo: true });
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
