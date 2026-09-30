import { create } from 'zustand';
import { opKey, type Repository, type WriteOp } from '@/data/repository';
import { DEFAULT_SETTINGS, emptyTables, type Settings, type Tables } from '@/data/types';
import { applyChanges, mergeEntries, Tx, type Change, type HistoryEntry } from './history';

interface DataState {
  ready: boolean;
  tables: Tables;
  settings: Settings;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Set when saving failed; cleared by the next successful save. */
  saveError: string | null;
}

export const useData = create<DataState>(() => ({
  ready: false,
  tables: emptyTables(),
  settings: DEFAULT_SETTINGS,
  past: [],
  future: [],
  saveError: null,
}));

const HISTORY_LIMIT = 200;
const COALESCE_MS = 2000;
const FLUSH_MS = 150;
const RETRY_MS = 2000;

let repo: Repository | null = null;
let pending = new Map<string, WriteOp>();
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
let nextEntryId = 1;

function normalizeSettings(stored: Partial<Settings>): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!Array.isArray(settings.groceryCategories) || !settings.groceryCategories.length) {
    settings.groceryCategories = DEFAULT_SETTINGS.groceryCategories;
  }
  return settings;
}

export async function initData(repository: Repository): Promise<void> {
  repo = repository;
  const { tables, settings } = await repository.load();
  useData.setState({
    ready: true,
    tables,
    settings: normalizeSettings(settings),
    past: [],
    future: [],
  });
}

function queue(ops: WriteOp[]): void {
  for (const op of ops) pending.set(opKey(op), op);
  if (!timer) timer = setTimeout(() => void flushWrites(), FLUSH_MS);
}

/** Writes queued changes now. Resolves once everything queued so far is saved (or failed). */
export function flushWrites(retry = true): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!repo || pending.size === 0) return chain;
  const ops = [...pending.values()];
  pending = new Map();
  const target = repo;
  chain = chain.then(() =>
    target.write(ops).then(
      () => {
        if (useData.getState().saveError) useData.setState({ saveError: null });
      },
      (err: unknown) => {
        console.error('Saving failed', err);
        useData.setState({ saveError: err instanceof Error ? err.message : String(err) });
        if (!retry) return;
        // Retry once, unless a newer write for the same row is already queued.
        for (const op of ops) if (!pending.has(opKey(op))) pending.set(opKey(op), op);
        setTimeout(() => void flushWrites(false), RETRY_MS);
      },
    ),
  );
  return chain;
}

function toOps(changes: Change[], side: 'before' | 'after', touch?: number): WriteOp[] {
  return changes.map((c) => {
    const row = c[side];
    if (!row) return { kind: 'delete', table: c.table, id: c.id };
    const stamped = touch && 'updatedAt' in row ? { ...row, updatedAt: touch } : row;
    return { kind: 'put', table: c.table, row: stamped };
  });
}

export interface CommitOptions {
  /** Merge with the previous undo step if it has the same key and was recent. */
  coalesce?: string;
  /** Leave out of undo history (e.g. reminder bookkeeping, emptying the trash). */
  undoable?: boolean;
}

/**
 * Runs `fn` against a transaction, applies its changes to the store, queues
 * them for saving and records an undo step. Returns whatever `fn` returns.
 */
export function commit<R>(label: string, fn: (tx: Tx) => R, options: CommitOptions = {}): R {
  const state = useData.getState();
  const tx = new Tx(state.tables, Date.now());
  const result = fn(tx);
  const changes = tx.effectiveChanges();
  if (!changes.length) return result;

  const tables = applyChanges(state.tables, changes, 'after');
  if (options.undoable === false) {
    useData.setState({ tables });
  } else {
    const entry: HistoryEntry = {
      id: nextEntryId++,
      label,
      changes,
      coalesceKey: options.coalesce,
      at: tx.now,
    };
    const top = state.past[state.past.length - 1];
    const past =
      options.coalesce && top?.coalesceKey === options.coalesce && entry.at - top.at < COALESCE_MS
        ? [...state.past.slice(0, -1), mergeEntries(top, entry)]
        : [...state.past, entry].slice(-HISTORY_LIMIT);
    useData.setState({ tables, past, future: [] });
  }
  queue(toOps(changes, 'after'));
  return result;
}

/** The id of the newest undo step, so a toast can undo exactly that action. */
export function lastEntryId(): number | null {
  const { past } = useData.getState();
  return past.length ? past[past.length - 1].id : null;
}

/** Undoes the newest step. Returns its label, or null if there was nothing to undo. */
export function undo(): string | null {
  const state = useData.getState();
  const entry = state.past[state.past.length - 1];
  if (!entry) return null;
  const now = Date.now();
  useData.setState({
    tables: applyChanges(state.tables, entry.changes, 'before', now),
    past: state.past.slice(0, -1),
    future: [...state.future, entry],
  });
  queue(toOps(entry.changes, 'before', now));
  return entry.label;
}

export function redo(): string | null {
  const state = useData.getState();
  const entry = state.future[state.future.length - 1];
  if (!entry) return null;
  const now = Date.now();
  useData.setState({
    tables: applyChanges(state.tables, entry.changes, 'after', now),
    past: [...state.past, entry],
    future: state.future.slice(0, -1),
  });
  queue(toOps(entry.changes, 'after', now));
  return entry.label;
}

/** Undoes a specific step, but only if nothing newer has happened since. */
export function undoEntry(id: number): boolean {
  if (lastEntryId() !== id) return false;
  undo();
  return true;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useData.setState((s) => ({ settings: { ...s.settings, [key]: value } }));
  queue([{ kind: 'setting', key, value }]);
}

/** Replaces all data in memory and storage, e.g. for tests. Clears undo history. */
export function resetForTests(repository: Repository | null, tables = emptyTables()): void {
  repo = repository;
  pending = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
  chain = Promise.resolve();
  useData.setState({
    ready: true,
    tables,
    settings: DEFAULT_SETTINGS,
    past: [],
    future: [],
    saveError: null,
  });
}
