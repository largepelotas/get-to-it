import type { LoadResult, Repository, WriteOp } from './repository';
import { emptyTables, TABLE_NAMES, type AnyRow, type Settings, type TableName } from './types';

/** Runs SQL. In the app this goes to the Rust side; tests use node:sqlite. */
export interface SqlExecutor {
  select(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs all statements in one transaction. */
  batch(statements: { sql: string; params: unknown[] }[]): Promise<void>;
}

type ColumnType = 'text' | 'int' | 'bool' | 'json';

interface Column {
  field: string;
  column: string;
  type: ColumnType;
}

function snake(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** The SQL table for a table of the data (`focusSessions` is `focus_sessions`). */
function sqlTable(table: TableName): string {
  return snake(table);
}

function columns(spec: Record<string, ColumnType>): Column[] {
  return Object.entries(spec).map(([field, type]) => ({ field, column: snake(field), type }));
}

/** How each table's fields map to SQLite columns. Columns are matched by name, so
 * the order here doesn't have to follow the migrations. */
const SCHEMA: Record<TableName, Column[]> = {
  folders: columns({
    id: 'text',
    name: 'text',
    color: 'text',
    sortKey: 'text',
    collapsed: 'bool',
    createdAt: 'int',
    updatedAt: 'int',
    deletedAt: 'int',
  }),
  lists: columns({
    id: 'text',
    folderId: 'text',
    type: 'text',
    title: 'text',
    color: 'text',
    pinned: 'bool',
    sortKey: 'text',
    showCompleted: 'bool',
    archivedAt: 'int',
    deletedAt: 'int',
    createdAt: 'int',
    updatedAt: 'int',
  }),
  items: columns({
    id: 'text',
    listId: 'text',
    parentId: 'text',
    text: 'text',
    checked: 'bool',
    completedAt: 'int',
    sortKey: 'text',
    collapsed: 'bool',
    details: 'text',
    dueDate: 'text',
    dueTime: 'text',
    priority: 'int',
    recurrence: 'json',
    quantity: 'text',
    category: 'text',
    createdAt: 'int',
    updatedAt: 'int',
    deletedAt: 'int',
    // Added in migration 2.
    wontDo: 'bool',
    // Added in migration 4.
    sectionId: 'text',
    // Added in migration 5.
    labelIds: 'json',
    // Added in migration 7.
    endTime: 'text',
    deadline: 'text',
  }),
  labels: columns({
    id: 'text',
    name: 'text',
    color: 'text',
    sortKey: 'text',
    createdAt: 'int',
    updatedAt: 'int',
  }),
  sections: columns({
    id: 'text',
    listId: 'text',
    title: 'text',
    sortKey: 'text',
    collapsed: 'bool',
    createdAt: 'int',
    updatedAt: 'int',
  }),
  filters: columns({
    id: 'text',
    name: 'text',
    query: 'text',
    color: 'text',
    sortKey: 'text',
    createdAt: 'int',
    updatedAt: 'int',
  }),
  reminders: columns({
    id: 'text',
    itemId: 'text',
    kind: 'text',
    offsetMinutes: 'int',
    at: 'int',
    firedFor: 'int',
    dismissedFor: 'int',
    snoozedUntil: 'int',
    // Added in migration 3.
    constant: 'bool',
    createdAt: 'int',
    updatedAt: 'int',
  }),
  completions: columns({
    id: 'text',
    itemId: 'text',
    dueDate: 'text',
    completedAt: 'int',
  }),
  notes: columns({
    id: 'text',
    content: 'text',
    plainText: 'text',
    updatedAt: 'int',
  }),
  focusSessions: columns({
    id: 'text',
    itemId: 'text',
    kind: 'text',
    startedAt: 'int',
    endedAt: 'int',
    seconds: 'int',
  }),
};

/** Schema migrations, applied in order and tracked with PRAGMA user_version. */
export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      sort_key TEXT NOT NULL,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    `CREATE TABLE lists (
      id TEXT PRIMARY KEY NOT NULL,
      folder_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('todo', 'grocery', 'note')),
      title TEXT NOT NULL,
      color TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      sort_key TEXT NOT NULL,
      show_completed INTEGER NOT NULL DEFAULT 1,
      archived_at INTEGER,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      parent_id TEXT,
      text TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      sort_key TEXT NOT NULL,
      collapsed INTEGER NOT NULL DEFAULT 0,
      details TEXT,
      due_date TEXT,
      due_time TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      recurrence TEXT,
      quantity TEXT,
      category TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    `CREATE INDEX items_list_id ON items (list_id)`,
    `CREATE INDEX items_due_date ON items (due_date) WHERE due_date IS NOT NULL`,
    `CREATE TABLE reminders (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('relative', 'absolute')),
      offset_minutes INTEGER,
      at INTEGER,
      fired_for INTEGER,
      dismissed_for INTEGER,
      snoozed_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX reminders_item_id ON reminders (item_id)`,
    `CREATE TABLE completions (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      due_date TEXT,
      completed_at INTEGER NOT NULL
    )`,
    `CREATE INDEX completions_item_id ON completions (item_id)`,
    `CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      plain_text TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    // Records permanently deleted rows so a future sync can propagate deletes.
    `CREATE TABLE tombstones (
      entity TEXT NOT NULL,
      id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL,
      PRIMARY KEY (entity, id)
    )`,
  ],
  // Tasks closed without being done.
  [`ALTER TABLE items ADD COLUMN wont_do INTEGER NOT NULL DEFAULT 0`],
  // Reminders that keep notifying until dealt with.
  [`ALTER TABLE reminders ADD COLUMN constant INTEGER NOT NULL DEFAULT 0`],
  // Sections inside to-do lists, and the section a task sits in.
  [
    `CREATE TABLE sections (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_key TEXT NOT NULL,
      collapsed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX sections_list_id ON sections (list_id)`,
    `ALTER TABLE items ADD COLUMN section_id TEXT`,
  ],
  // Labels, and the labels on a task (a JSON array of ids).
  [
    `CREATE TABLE labels (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      sort_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `ALTER TABLE items ADD COLUMN label_ids TEXT`,
  ],
  // Filters: saved searches.
  [
    `CREATE TABLE filters (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      color TEXT,
      sort_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ],
  // A task's end time (a time range) and its deadline.
  [`ALTER TABLE items ADD COLUMN end_time TEXT`, `ALTER TABLE items ADD COLUMN deadline TEXT`],
  // Focus sessions: time logged on a task with the focus timer.
  [
    `CREATE TABLE focus_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('pomodoro', 'stopwatch')),
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      seconds INTEGER NOT NULL
    )`,
    `CREATE INDEX focus_sessions_item_id ON focus_sessions (item_id)`,
  ],
];

function toColumnValue(value: unknown, type: ColumnType): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'bool':
      return value ? 1 : 0;
    case 'json':
      return JSON.stringify(value);
    default:
      return value;
  }
}

function fromColumnValue(value: unknown, type: ColumnType): unknown {
  switch (type) {
    case 'bool':
      return Boolean(value);
    case 'json':
      if (typeof value !== 'string') return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value ?? null;
  }
}

export function rowToRecord(table: TableName, row: AnyRow): unknown[] {
  const record = row as unknown as Record<string, unknown>;
  return SCHEMA[table].map((c) => toColumnValue(record[c.field], c.type));
}

export function recordToRow(table: TableName, record: Record<string, unknown>): AnyRow {
  const row: Record<string, unknown> = {};
  for (const c of SCHEMA[table]) row[c.field] = fromColumnValue(record[c.column], c.type);
  // A task saved before labels existed has no value.
  if (table === 'items' && !Array.isArray(row.labelIds)) row.labelIds = [];
  return row as unknown as AnyRow;
}

function putSql(table: TableName): string {
  const cols = SCHEMA[table].map((c) => c.column);
  return `INSERT OR REPLACE INTO ${sqlTable(table)} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
}

export class SqliteRepository implements Repository {
  private ready: Promise<void> | null = null;

  constructor(private readonly db: SqlExecutor) {}

  private migrate(): Promise<void> {
    this.ready ??= (async () => {
      const [row] = await this.db.select('PRAGMA user_version');
      const version = Number(row?.user_version ?? 0);
      for (let v = version; v < MIGRATIONS.length; v++) {
        await this.db.batch([
          ...MIGRATIONS[v].map((sql) => ({ sql, params: [] })),
          { sql: `PRAGMA user_version = ${v + 1}`, params: [] },
        ]);
      }
    })();
    return this.ready;
  }

  async load(): Promise<LoadResult> {
    await this.migrate();
    const tables = emptyTables();
    for (const table of TABLE_NAMES) {
      const records = await this.db.select(`SELECT * FROM ${sqlTable(table)}`);
      const target = tables[table] as Record<string, AnyRow>;
      for (const record of records) {
        const row = recordToRow(table, record);
        target[row.id] = row;
      }
    }
    const settings: Record<string, unknown> = {};
    for (const record of await this.db.select('SELECT key, value FROM settings')) {
      try {
        settings[String(record.key)] = JSON.parse(String(record.value));
      } catch {
        // Skip a corrupt value; the default applies.
      }
    }
    return { tables, settings: settings as Partial<Settings> };
  }

  /**
   * Swaps in a whole new data set in one transaction. Rows that don't come
   * back get a tombstone, as if they'd been deleted.
   */
  async replaceAll({ tables, settings }: LoadResult): Promise<void> {
    await this.migrate();
    const now = Date.now();
    const statements: { sql: string; params: unknown[] }[] = [];
    for (const table of TABLE_NAMES) {
      statements.push(
        {
          sql: `INSERT OR REPLACE INTO tombstones (entity, id, deleted_at) SELECT '${table}', id, ? FROM ${sqlTable(table)}`,
          params: [now],
        },
        { sql: `DELETE FROM ${sqlTable(table)}`, params: [] },
        ...Object.values(tables[table] ?? {}).map((row) => ({
          sql: putSql(table),
          params: rowToRecord(table, row),
        })),
        {
          sql: `DELETE FROM tombstones WHERE entity = '${table}' AND id IN (SELECT id FROM ${sqlTable(table)})`,
          params: [],
        },
      );
    }
    statements.push({ sql: 'DELETE FROM settings', params: [] });
    for (const [key, value] of Object.entries(settings)) {
      statements.push({
        sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
        params: [key, JSON.stringify(value ?? null)],
      });
    }
    await this.db.batch(statements);
  }

  async write(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    await this.migrate();
    const now = Date.now();
    const statements = ops.flatMap((op) => {
      switch (op.kind) {
        case 'setting':
          return [
            {
              sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
              params: [op.key, JSON.stringify(op.value ?? null)],
            },
          ];
        case 'put':
          return [{ sql: putSql(op.table), params: rowToRecord(op.table, op.row) }];
        case 'delete':
          return [
            { sql: `DELETE FROM ${sqlTable(op.table)} WHERE id = ?`, params: [op.id] },
            {
              sql: 'INSERT OR REPLACE INTO tombstones (entity, id, deleted_at) VALUES (?, ?, ?)',
              params: [op.table, op.id, now],
            },
          ];
      }
    });
    await this.db.batch(statements);
  }
}
