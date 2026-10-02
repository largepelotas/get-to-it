// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SqliteRepository, type SqlExecutor } from './sqlite';
import { emptyTables, type CheckIn, type FocusSession, type Item, type List } from './types';

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
  sectionId: null,
  labelIds: [],
  text: 'Write plan',
  checked: false,
  wontDo: false,
  completedAt: null,
  sortKey: 'a0',
  collapsed: false,
  details: null,
  dueDate: '2026-10-01',
  dueTime: '09:30',
  endTime: null,
  deadline: null,
  priority: 2,
  recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3], mode: 'schedule' },
  quantity: null,
  category: null,
  habit: null,
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
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
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
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
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
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    await repo.write([
      { kind: 'put', table: 'reminders', row: { ...data.tables.reminders.R1, constant: true } },
    ]);
    expect((await new SqliteRepository(exec).load()).tables.reminders.R1.constant).toBe(true);
  });

  // Bug prevented: upgrading a version 3 database losing tasks, or leaving them in a
  // section that does not exist; and sections not surviving a save and reload.
  it('adds sections to a version 3 database, with every task unsectioned', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 3).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 3');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(data.tables.items.OLD).toMatchObject({ text: 'Old task', sectionId: null });
    expect(data.tables.sections).toEqual({});
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    const section = {
      id: 'S1',
      listId: 'L1',
      title: 'Kitchen',
      sortKey: 'a0',
      collapsed: true,
      createdAt: 1,
      updatedAt: 1,
    };
    await repo.write([
      { kind: 'put', table: 'sections', row: section },
      { kind: 'put', table: 'items', row: { ...data.tables.items.OLD, sectionId: 'S1' } },
    ]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.sections.S1).toEqual(section);
    expect(again.tables.items.OLD.sectionId).toBe('S1');
    await repo.write([{ kind: 'delete', table: 'sections', id: 'S1' }]);
    expect((await repo.load()).tables.sections).toEqual({});
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

describe('labels migration', () => {
  // Bug prevented: upgrading a version 4 database losing tasks or reading them with labelIds
  // missing (which later code would call .includes on); labels not surviving a save and reload.
  it('adds labels to a version 4 database, with every task unlabelled', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 4).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 4');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(MIGRATIONS).toHaveLength(9);
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    expect(data.tables.items.OLD).toMatchObject({ text: 'Old task', labelIds: [] });
    expect(data.tables.labels).toEqual({});
    const label = {
      id: 'B1',
      name: 'Errands',
      color: 'teal' as const,
      sortKey: 'a0',
      createdAt: 1,
      updatedAt: 1,
    };
    await repo.write([
      { kind: 'put', table: 'labels', row: label },
      { kind: 'put', table: 'items', row: { ...data.tables.items.OLD, labelIds: ['B1', 'B2'] } },
    ]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.labels.B1).toEqual(label);
    expect(again.tables.items.OLD.labelIds).toEqual(['B1', 'B2']);
    await repo.write([{ kind: 'delete', table: 'labels', id: 'B1' }]);
    expect((await repo.load()).tables.labels).toEqual({});
  });
});

describe('filters migration', () => {
  // Bug prevented: upgrading a version 5 database failing, or filters not surviving a save and reload.
  it('adds filters to a version 5 database, with none to start', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 5).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 5');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(MIGRATIONS).toHaveLength(9);
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    expect(data.tables.items.OLD).toMatchObject({ text: 'Old task' });
    expect(data.tables.filters).toEqual({});
    const filter = {
      id: 'F1',
      name: 'This week',
      query: '#Work & 7 days',
      color: null,
      sortKey: 'a0',
      createdAt: 1,
      updatedAt: 1,
    };
    await repo.write([{ kind: 'put', table: 'filters', row: filter }]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.filters.F1).toEqual(filter);
    await repo.write([{ kind: 'delete', table: 'filters', id: 'F1' }]);
    expect((await repo.load()).tables.filters).toEqual({});
  });
});

describe('deadlines and end times migration', () => {
  // Bug prevented: upgrading a version 6 database failing, old tasks loading with the new fields
  // undefined, or an end time and deadline not surviving a save and reload.
  it('adds endTime and deadline to a version 6 database, null for old tasks', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 6).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 6');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect(MIGRATIONS).toHaveLength(9);
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    expect(data.tables.items.OLD).toMatchObject({ endTime: null, deadline: null });
    const item = { ...data.tables.items.OLD, dueDate: '2026-10-03', dueTime: '14:00' };
    await repo.write([
      { kind: 'put', table: 'items', row: { ...item, endTime: '15:30', deadline: '2026-10-10' } },
    ]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.items.OLD).toMatchObject({ endTime: '15:30', deadline: '2026-10-10' });
  });
});

describe('focus sessions migration', () => {
  // Bug prevented: upgrading a version 7 database failing or dropping its tasks, or a logged
  // focus session not surviving a save and reload with every field intact.
  it('adds focus sessions to a version 7 database, with none to start', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 7).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 7');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'L1', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    expect(data.tables.focusSessions).toEqual({});
    expect(data.tables.items.OLD.text).toBe('Old task');
    const session: FocusSession = {
      id: 'S1',
      itemId: 'OLD',
      kind: 'pomodoro',
      startedAt: 1000,
      endedAt: 2500000,
      seconds: 1500,
    };
    await repo.write([{ kind: 'put', table: 'focusSessions', row: session }]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.focusSessions).toEqual({ S1: session });
  });
});

describe('habits migration', () => {
  // Bug prevented: the lists CHECK still refusing 'habit', or rebuilding the lists table losing
  // lists (or their columns) on upgrade, or a habit's goal and check-ins not surviving a reload.
  it('upgrades a version 8 database keeping its rows, and round-trips a habit list', async () => {
    const exec = nodeExecutor();
    exec.raw.exec('BEGIN');
    for (const sql of MIGRATIONS.slice(0, 8).flat()) exec.raw.exec(sql);
    exec.raw.exec('PRAGMA user_version = 8');
    exec.raw.exec('COMMIT');
    exec.raw.exec(
      `INSERT INTO lists (id, folder_id, type, title, color, pinned, sort_key, show_completed,
        archived_at, deleted_at, created_at, updated_at)
       VALUES ('OLDL', 'F9', 'grocery', 'Shop', 'teal', 1, 'a5', 0, 7, 8, 3, 4)`,
    );
    exec.raw.exec(
      `INSERT INTO items (id, list_id, text, checked, sort_key, created_at, updated_at)
       VALUES ('OLD', 'OLDL', 'Old task', 0, 'a0', 1, 1)`,
    );
    const repo = new SqliteRepository(exec);
    const data = await repo.load();
    expect((await exec.select('PRAGMA user_version'))[0].user_version).toBe(9);
    expect(data.tables.lists.OLDL).toEqual({
      id: 'OLDL',
      folderId: 'F9',
      type: 'grocery',
      title: 'Shop',
      color: 'teal',
      pinned: true,
      sortKey: 'a5',
      showCompleted: false,
      archivedAt: 7,
      deletedAt: 8,
      createdAt: 3,
      updatedAt: 4,
    });
    expect(data.tables.items.OLD).toMatchObject({ text: 'Old task', habit: null });
    expect(data.tables.checkIns).toEqual({});

    const habitList: List = { ...list, id: 'H1', type: 'habit', title: 'Habits' };
    const habit: Item = { ...item, id: 'H2', listId: 'H1', habit: { period: 'week', times: 3 } };
    const checkIn: CheckIn = { id: 'C1', itemId: 'H2', day: '2026-10-01', createdAt: 5 };
    await repo.write([
      { kind: 'put', table: 'lists', row: habitList },
      { kind: 'put', table: 'items', row: habit },
      { kind: 'put', table: 'checkIns', row: checkIn },
    ]);
    const again = await new SqliteRepository(exec).load();
    expect(again.tables.lists.H1.type).toBe('habit');
    expect(again.tables.items.H2.habit).toEqual({ period: 'week', times: 3 });
    expect(again.tables.checkIns).toEqual({ C1: checkIn });
    await repo.write([{ kind: 'delete', table: 'checkIns', id: 'C1' }]);
    expect((await repo.load()).tables.checkIns).toEqual({});
  });
});
