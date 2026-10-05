import { create } from 'zustand';
import { opKey, type LoadResult, type Repository, type WriteOp } from '@/data/repository';
import { isTimeString } from '@/lib/dates';
import { cleanFeeds } from '@/lib/feedLinks';
import { cleanMinutes } from '@/lib/focus';
import { resolvePaletteName } from '@/lib/theme';
import { cleanZoom } from '@/lib/zoom';
import {
  BUILT_IN_VIEWS,
  CALENDAR_LAYOUTS,
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  DEFAULT_SETTINGS,
  emptyTables,
  MAX_BREAK_MINUTES,
  MAX_FOCUS_MINUTES,
  type Settings,
  type Tables,
} from '@/data/types';
import { applyChanges, mergeEntries, Tx, type Change, type HistoryEntry } from './history';
import { cleanMatrix, cleanViewOptions } from './viewOptions';

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
const RETRY_MAX_MS = 30_000;

let repo: Repository | null = null;
let pending = new Map<string, WriteOp>();
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
/** A save has failed and its changes are back in `pending`, waiting to be tried again. */
let failed = false;
let retryMs = RETRY_MS;
/** Goes up when the data is replaced, so a save that fails afterwards isn't tried again. */
let epoch = 0;
let nextEntryId = 1;

function normalizeSettings(stored: Partial<Settings>): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!Array.isArray(settings.groceryCategories) || !settings.groceryCategories.length) {
    settings.groceryCategories = DEFAULT_SETTINGS.groceryCategories;
  }
  // Unknown view names (a hand-edited or newer file) are dropped.
  settings.hiddenViews = Array.isArray(settings.hiddenViews)
    ? BUILT_IN_VIEWS.filter((v) => settings.hiddenViews.includes(v))
    : [];
  if (settings.dailyReviewTime !== null && !isTimeString(settings.dailyReviewTime)) {
    settings.dailyReviewTime = null;
  }
  if (!CALENDAR_LAYOUTS.includes(settings.calendarLayout)) {
    settings.calendarLayout = DEFAULT_SETTINGS.calendarLayout;
  }
  settings.viewOptions = cleanViewOptions(settings.viewOptions);
  settings.matrix = cleanMatrix(settings.matrix) ?? DEFAULT_SETTINGS.matrix;
  // A palette saved under an old name becomes its replacement; unknown names fall back to the default.
  settings.palette = resolvePaletteName(settings.palette) ?? DEFAULT_SETTINGS.palette;
  settings.zoom = cleanZoom(settings.zoom);
  settings.calendarFeeds = cleanFeeds(settings.calendarFeeds);
  settings.focusMinutes = cleanMinutes(
    settings.focusMinutes,
    DEFAULT_FOCUS_MINUTES,
    MAX_FOCUS_MINUTES,
  );
  settings.breakMinutes = cleanMinutes(
    settings.breakMinutes,
    DEFAULT_BREAK_MINUTES,
    MAX_BREAK_MINUTES,
  );
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

/**
 * Writes queued changes now. Resolves once everything queued so far has been
 * tried. Changes that couldn't be saved go back in the queue and are tried again,
 * a little later each time, for as long as the app runs; `hasUnsavedChanges`
 * says whether any are left.
 */
export function flushWrites(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!repo || pending.size === 0) return chain;
  const ops = [...pending.values()];
  pending = new Map();
  // This batch holds everything that failed before, so it starts with a clean slate.
  failed = false;
  const target = repo;
  const started = epoch;
  chain = chain.then(() => {
    // The data was replaced while this waited its turn: these rows belong to the old set.
    if (started !== epoch) return;
    return target.write(ops).then(
      () => {
        if (started !== epoch) return;
        retryMs = RETRY_MS;
        // An earlier batch that failed meanwhile is still waiting, so the warning stays.
        if (!failed && useData.getState().saveError) useData.setState({ saveError: null });
      },
      (err: unknown) => {
        console.error('Saving failed', err);
        if (started !== epoch) return;
        useData.setState({ saveError: err instanceof Error ? err.message : String(err) });
        // Back in the queue, under any newer write for the same row.
        const waiting = pending;
        pending = new Map(ops.map((op) => [opKey(op), op]));
        for (const [key, op] of waiting) pending.set(key, op);
        failed = true;
        timer ??= setTimeout(() => void flushWrites(), retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      },
    );
  });
  return chain;
}

/** True while changes are waiting to be saved, including ones that failed and will be tried again. */
export function hasUnsavedChanges(): boolean {
  return pending.size > 0;
}

/** A put or delete for each changed row, as it now stands in `tables`. */
function rowOps(tables: Tables, changes: Change[]): WriteOp[] {
  return changes.map((c) => {
    const row = tables[c.table][c.id];
    return row
      ? { kind: 'put', table: c.table, row }
      : { kind: 'delete', table: c.table, id: c.id };
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
  // Queue the save before updating the store: a listener may commit in
  // response (reminder bookkeeping), and its newer write must win.
  queue(rowOps(tables, changes));
  if (options.undoable === false) {
    const removed = new Set(changes.filter((c) => !c.after).map((c) => `${c.table}:${c.id}`));
    useData.setState(removed.size ? { tables, ...pruneHistory(state, removed) } : { tables });
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
  return result;
}

/**
 * Drops undo steps that touch rows which no longer exist. Undoing them after
 * a permanent delete (emptying the Trash) would bring back half a list.
 */
function pruneHistory(state: DataState, removed: Set<string>) {
  const keep = (entry: HistoryEntry) =>
    !entry.changes.some((c) => removed.has(`${c.table}:${c.id}`));
  return { past: state.past.filter(keep), future: state.future.filter(keep) };
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
  const tables = applyChanges(state.tables, entry.changes, 'before', Date.now());
  queue(rowOps(tables, entry.changes));
  useData.setState({
    tables,
    past: state.past.slice(0, -1),
    future: [...state.future, entry],
  });
  return entry.label;
}

export function redo(): string | null {
  const state = useData.getState();
  const entry = state.future[state.future.length - 1];
  if (!entry) return null;
  const tables = applyChanges(state.tables, entry.changes, 'after', Date.now());
  queue(rowOps(tables, entry.changes));
  useData.setState({
    tables,
    past: [...state.past, entry],
    future: state.future.slice(0, -1),
  });
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

/**
 * Replaces all data and settings with an imported set, in storage and then
 * in memory. Pending saves are written first so they can't land on top of
 * the import. Undo history is cleared, since it describes the old data.
 * Settings that belong to this computer (`keep`) carry over.
 */
export async function replaceData(data: LoadResult, keep: (keyof Settings)[] = []): Promise<void> {
  if (!repo) throw new Error('Storage isn’t ready');
  await flushWrites();
  const current = useData.getState().settings;
  const settings: Partial<Settings> = { ...data.settings };
  for (const key of keep) (settings as Record<string, unknown>)[key] = current[key];
  const target = repo;
  // In line behind any save still running, so none of them can land on top of it.
  const replaced = chain.then(() => target.replaceAll({ tables: data.tables, settings }));
  chain = replaced.catch(() => {});
  await replaced;
  // Anything queued meanwhile (or waiting to retry) was for the old data.
  forgetPending();
  useData.setState({
    tables: data.tables,
    settings: normalizeSettings(settings),
    past: [],
    future: [],
    saveError: null,
  });
}

/** Drops every queued save, and any retry of one that failed. */
function forgetPending(): void {
  pending = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
  failed = false;
  retryMs = RETRY_MS;
  epoch++;
}

/** Replaces all data in memory and storage, e.g. for tests. Clears undo history. */
export function resetForTests(repository: Repository | null, tables = emptyTables()): void {
  repo = repository;
  forgetPending();
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
