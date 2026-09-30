import type { LoadResult, Repository, WriteOp } from './repository';
import { emptyTables, type Settings, type Tables } from './types';

/** Keeps everything in memory. Used by tests, and as the base for localStorage. */
export class MemoryRepository implements Repository {
  protected tables: Tables;
  protected settings: Partial<Settings>;

  constructor(initial?: Partial<LoadResult>) {
    this.tables = structuredClone(initial?.tables ?? emptyTables());
    this.settings = structuredClone(initial?.settings ?? {});
  }

  async load(): Promise<LoadResult> {
    return structuredClone({ tables: this.tables, settings: this.settings });
  }

  async write(ops: WriteOp[]): Promise<void> {
    for (const op of ops) {
      if (op.kind === 'setting') {
        (this.settings as Record<string, unknown>)[op.key] = structuredClone(op.value);
      } else if (op.kind === 'put') {
        (this.tables[op.table] as Record<string, unknown>)[op.row.id] = structuredClone(op.row);
      } else {
        delete this.tables[op.table][op.id];
      }
    }
  }
}
