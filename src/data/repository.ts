import type { AnyRow, Settings, TableName, Tables } from './types';

export type WriteOp =
  | { kind: 'put'; table: TableName; row: AnyRow }
  | { kind: 'delete'; table: TableName; id: string }
  | { kind: 'setting'; key: keyof Settings; value: unknown };

export interface LoadResult {
  tables: Tables;
  settings: Partial<Settings>;
}

/**
 * Where data is stored. The desktop app uses SQLite, the browser preview uses
 * localStorage and tests use memory. A synced store would implement this too.
 */
export interface Repository {
  load(): Promise<LoadResult>;
  /** Applies every op, all or nothing. */
  write(ops: WriteOp[]): Promise<void>;
}

/** Key used to collapse repeated writes to the same row. */
export function opKey(op: WriteOp): string {
  return op.kind === 'setting'
    ? `setting:${op.key}`
    : `${op.table}:${op.kind === 'put' ? op.row.id : op.id}`;
}
