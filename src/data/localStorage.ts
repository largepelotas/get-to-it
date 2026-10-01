import { MemoryRepository } from './memory';
import type { LoadResult, WriteOp } from './repository';
import { emptyTables } from './types';

const KEY = 'checklist:data:v1';

/** Browser preview storage: the whole data set as one JSON value. */
export class LocalStorageRepository extends MemoryRepository {
  constructor(private readonly storage: Storage = window.localStorage) {
    super(LocalStorageRepository.read(storage));
  }

  private static read(storage: Storage): LoadResult | undefined {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as LoadResult;
      const tables = { ...emptyTables(), ...parsed.tables };
      // Items saved before "won't do" existed don't have the field.
      tables.items = Object.fromEntries(
        Object.entries(tables.items).map(([id, item]) => [id, { ...item, wontDo: !!item.wontDo }]),
      );
      // Reminders saved before constant reminders existed don't have the field.
      tables.reminders = Object.fromEntries(
        Object.entries(tables.reminders).map(([id, r]) => [id, { ...r, constant: !!r.constant }]),
      );
      // Items saved before sections existed don't have the field.
      tables.items = Object.fromEntries(
        Object.entries(tables.items).map(([id, item]) => [
          id,
          { ...item, sectionId: item.sectionId ?? null },
        ]),
      );
      return { tables, settings: parsed.settings ?? {} };
    } catch {
      return undefined;
    }
  }

  async write(ops: WriteOp[]): Promise<void> {
    await super.write(ops);
    this.persist();
  }

  async replaceAll(data: LoadResult): Promise<void> {
    await super.replaceAll(data);
    this.persist();
  }

  private persist(): void {
    this.storage.setItem(KEY, JSON.stringify({ tables: this.tables, settings: this.settings }));
  }
}
