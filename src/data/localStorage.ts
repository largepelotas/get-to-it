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
      return { tables: { ...emptyTables(), ...parsed.tables }, settings: parsed.settings ?? {} };
    } catch {
      return undefined;
    }
  }

  async write(ops: WriteOp[]): Promise<void> {
    await super.write(ops);
    this.storage.setItem(KEY, JSON.stringify({ tables: this.tables, settings: this.settings }));
  }
}
