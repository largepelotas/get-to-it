import type { AnyRow, Row, TableName, Tables } from '@/data/types';

/** One row's state before and after a change. `undefined` means absent. */
export interface Change {
  table: TableName;
  id: string;
  before: AnyRow | undefined;
  after: AnyRow | undefined;
}

export interface HistoryEntry {
  id: number;
  label: string;
  changes: Change[];
  /** Consecutive edits with the same key (e.g. typing in one field) merge into one entry. */
  coalesceKey?: string;
  at: number;
}

const changeKey = (table: TableName, id: string) => `${table}:${id}`;

/**
 * Collects changes for one user action. Reads see earlier writes in the same
 * transaction. Nothing touches the store until the transaction is committed.
 */
export class Tx {
  readonly changes = new Map<string, Change>();

  constructor(
    private readonly base: Tables,
    readonly now: number,
  ) {}

  get<T extends TableName>(table: T, id: string | null | undefined): Row<T> | undefined {
    if (!id) return undefined;
    const change = this.changes.get(changeKey(table, id));
    if (change) return change.after as Row<T> | undefined;
    return this.base[table][id] as Row<T> | undefined;
  }

  /** Every row in a table, including this transaction's changes. */
  all<T extends TableName>(table: T): Row<T>[] {
    const rows = { ...(this.base[table] as Record<string, Row<T>>) };
    for (const change of this.changes.values()) {
      if (change.table !== table) continue;
      if (change.after) rows[change.id] = change.after as Row<T>;
      else delete rows[change.id];
    }
    return Object.values(rows);
  }

  put<T extends TableName>(table: T, row: Row<T>): Row<T> {
    const key = changeKey(table, row.id);
    const existing = this.changes.get(key);
    const before = existing ? existing.before : (this.base[table][row.id] as AnyRow | undefined);
    this.changes.set(key, { table, id: row.id, before, after: row });
    return row;
  }

  /** Merges a patch into a row and bumps `updatedAt` where the table has one. */
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Row<T> | undefined {
    const current = this.get(table, id);
    if (!current) return undefined;
    const next = { ...current, ...patch } as Row<T>;
    if ('updatedAt' in next) (next as { updatedAt: number }).updatedAt = this.now;
    return this.put(table, next);
  }

  remove(table: TableName, id: string): void {
    const key = changeKey(table, id);
    const existing = this.changes.get(key);
    const before = existing ? existing.before : (this.base[table][id] as AnyRow | undefined);
    if (!before && !existing) return;
    this.changes.set(key, { table, id, before, after: undefined });
  }

  /** Changes that actually alter something. */
  effectiveChanges(): Change[] {
    return [...this.changes.values()].filter((c) => c.before !== c.after);
  }
}

/** Returns new tables with each change set to its `before` or `after` state. */
export function applyChanges(
  tables: Tables,
  changes: Change[],
  side: 'before' | 'after',
  touch?: number,
): Tables {
  const next = { ...tables };
  const copied = new Set<TableName>();
  for (const change of changes) {
    if (!copied.has(change.table)) {
      (next as Record<TableName, unknown>)[change.table] = { ...tables[change.table] };
      copied.add(change.table);
    }
    const target = next[change.table] as Record<string, AnyRow>;
    const row = change[side];
    if (row) target[change.id] = touch && 'updatedAt' in row ? { ...row, updatedAt: touch } : row;
    else delete target[change.id];
  }
  return next;
}

/** Folds `next` into `prev`, keeping the earliest `before` for each row. */
export function mergeEntries(prev: HistoryEntry, next: HistoryEntry): HistoryEntry {
  const byKey = new Map(prev.changes.map((c) => [changeKey(c.table, c.id), { ...c }]));
  for (const c of next.changes) {
    const key = changeKey(c.table, c.id);
    const existing = byKey.get(key);
    if (existing) existing.after = c.after;
    else byKey.set(key, { ...c });
  }
  return { ...prev, changes: [...byKey.values()], at: next.at };
}
