import type { LoadResult, Repository, WriteOp } from './repository';
import { emptyTables, type Settings, type Tables } from './types';

/** Keeps everything in memory. Used by tests, and as the base for localStorage. */
export class MemoryRepository implements Repository {
  protected tables: Tables;
  protected settings: Partial<Settings>;

  constructor(initial?: Partial<LoadResult>) {
    this.tables = structuredClone(initial?.tables ?? emptyTables());
    this.settings = structuredClone(initial?.settings ?? {});
    // Reminders saved before constant reminders existed don't have the field.
    for (const r of Object.values(this.tables.reminders)) r.constant = !!r.constant;
    // Items saved before sections existed don't have the field, and old data has no table.
    this.tables = { ...emptyTables(), ...this.tables };
    for (const i of Object.values(this.tables.items)) i.sectionId = i.sectionId ?? null;
    // Items saved before labels existed don't have the field.
    for (const i of Object.values(this.tables.items)) i.labelIds = i.labelIds ?? [];
    // Items saved before deadlines existed don't have the fields.
    for (const i of Object.values(this.tables.items)) {
      i.endTime = i.endTime ?? null;
      i.deadline = i.deadline ?? null;
    }
    // Items saved before habits existed don't have the field.
    for (const i of Object.values(this.tables.items)) i.habit = i.habit ?? null;
  }

  async load(): Promise<LoadResult> {
    return structuredClone({ tables: this.tables, settings: this.settings });
  }

  async replaceAll(data: LoadResult): Promise<void> {
    this.tables = { ...emptyTables(), ...structuredClone(data.tables) };
    for (const i of Object.values(this.tables.items)) i.sectionId = i.sectionId ?? null;
    for (const i of Object.values(this.tables.items)) i.labelIds = i.labelIds ?? [];
    for (const i of Object.values(this.tables.items)) {
      i.endTime = i.endTime ?? null;
      i.deadline = i.deadline ?? null;
      i.habit = i.habit ?? null;
    }
    this.settings = structuredClone(data.settings);
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
