import type { LoadResult } from '@/data/repository';
import {
  COLOR_NAMES,
  DEFAULT_SETTINGS,
  emptyTables,
  TABLE_NAMES,
  type AnyRow,
  type Settings,
  type Snapshot,
  type TableName,
  type Tables,
} from '@/data/types';
import { isDateKey, isTimeString } from '@/lib/dates';
import { sanitizeRecurrence } from '@/lib/recurrence';

/*
 * The JSON export format (`Snapshot`), used for export, import and backups.
 * Imports are checked field by field, so a hand-edited or foreign file is
 * turned away with a reason instead of being half loaded.
 */

/** Settings that describe this computer rather than the data, so they aren't exported. */
const LOCAL_SETTINGS: (keyof Settings)[] = ['lastBackupAt'];

export function makeSnapshot(tables: Tables, settings: Settings, now = Date.now()): Snapshot {
  const exported: Partial<Settings> = { ...settings };
  for (const key of LOCAL_SETTINGS) delete exported[key];
  return {
    app: 'checklist',
    version: 1,
    exportedAt: now,
    tables: {
      folders: Object.values(tables.folders),
      lists: Object.values(tables.lists),
      items: Object.values(tables.items),
      reminders: Object.values(tables.reminders),
      completions: Object.values(tables.completions),
      notes: Object.values(tables.notes),
    },
    settings: exported,
  };
}

export function snapshotToJson(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export class ImportError extends Error {}

// Field checks. Each returns the value to store, or throws.

type Check = (value: unknown, field: string) => unknown;

const fail = (field: string, what: string): never => {
  throw new ImportError(`${field} ${what}`);
};

const str: Check = (v, f) => (typeof v === 'string' ? v : fail(f, 'should be text'));
const id: Check = (v, f) => (typeof v === 'string' && v ? v : fail(f, 'should be an id'));
const num: Check = (v, f) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(f, 'should be a number');
const bool: Check = (v, f) => (typeof v === 'boolean' ? v : fail(f, 'should be true or false'));
/** Null when missing. */
const opt =
  (check: Check): Check =>
  (v, f) =>
    v === undefined || v === null ? null : check(v, f);
/** A default when missing. */
const or =
  (check: Check, fallback: unknown): Check =>
  (v, f) =>
    v === undefined ? fallback : check(v, f);
const oneOf =
  (values: readonly unknown[]): Check =>
  (v, f) =>
    values.includes(v) ? v : fail(f, `should be one of ${values.join(', ')}`);
const color = opt(oneOf(COLOR_NAMES));
const date = opt((v, f) => (isDateKey(v) ? v : fail(f, 'should be a date (YYYY-MM-DD)')));
const time = opt((v, f) => (isTimeString(v) ? v : fail(f, 'should be a time (HH:mm)')));

const ROW_CHECKS: Record<TableName, Record<string, Check>> = {
  folders: {
    id,
    name: str,
    color,
    sortKey: str,
    collapsed: or(bool, false),
    createdAt: num,
    updatedAt: num,
    deletedAt: opt(num),
  },
  lists: {
    id,
    folderId: opt(id),
    type: oneOf(['todo', 'grocery', 'note']),
    title: str,
    color,
    pinned: or(bool, false),
    sortKey: str,
    showCompleted: or(bool, true),
    archivedAt: opt(num),
    deletedAt: opt(num),
    createdAt: num,
    updatedAt: num,
  },
  items: {
    id,
    listId: id,
    parentId: opt(id),
    text: str,
    checked: or(bool, false),
    completedAt: opt(num),
    sortKey: str,
    collapsed: or(bool, false),
    details: opt(str),
    dueDate: date,
    dueTime: time,
    priority: or(oneOf([0, 1, 2, 3]), 0),
    recurrence: (v) => sanitizeRecurrence(v),
    quantity: opt(str),
    category: opt(str),
    createdAt: num,
    updatedAt: num,
    deletedAt: opt(num),
  },
  reminders: {
    id,
    itemId: id,
    kind: oneOf(['relative', 'absolute']),
    offsetMinutes: opt(num),
    at: opt(num),
    firedFor: opt(num),
    dismissedFor: opt(num),
    snoozedUntil: opt(num),
    createdAt: num,
    updatedAt: num,
  },
  completions: { id, itemId: id, dueDate: date, completedAt: num },
  notes: { id, content: str, plainText: or(str, ''), updatedAt: num },
};

const TABLE_LABEL: Record<TableName, string> = {
  folders: 'folder',
  lists: 'list',
  items: 'item',
  reminders: 'reminder',
  completions: 'completion',
  notes: 'note',
};

function checkRow(table: TableName, raw: unknown, index: number): AnyRow {
  const where = `${TABLE_LABEL[table]} ${index + 1}`;
  if (!raw || typeof raw !== 'object') throw new ImportError(`The ${where} isn’t valid.`);
  const record = raw as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [field, check] of Object.entries(ROW_CHECKS[table])) {
    try {
      row[field] = check(record[field], field);
    } catch (err) {
      if (err instanceof ImportError) throw new ImportError(`In ${where}, ${err.message}.`);
      throw err;
    }
  }
  // A time only makes sense with a date.
  if (table === 'items' && !row.dueDate) row.dueTime = null;
  return row as unknown as AnyRow;
}

/** Keeps the settings this version knows, with the right types. Anything else is dropped. */
function checkSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = record[key];
    if (value === undefined || LOCAL_SETTINGS.includes(key as keyof Settings)) continue;
    if (key === 'defaultListId') {
      if (value === null || typeof value === 'string') out[key] = value;
    } else if (key === 'groceryCategories') {
      const valid =
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (c: unknown) =>
            !!c &&
            typeof (c as { id: unknown }).id === 'string' &&
            typeof (c as { name: unknown }).name === 'string',
        );
      if (valid)
        out[key] = value.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
    } else if (key === 'allDayReminderTime') {
      if (isTimeString(value)) out[key] = value;
    } else if (key === 'theme') {
      if (['system', 'light', 'dark'].includes(value as string)) out[key] = value;
    } else if (key === 'weekStartsOn') {
      if (value === 0 || value === 1) out[key] = value;
    } else if (typeof value === typeof fallback) {
      out[key] = value;
    }
  }
  return out as Partial<Settings>;
}

/**
 * Reads an exported file. Throws an `ImportError` with a message for the
 * user if it isn't a Checklist export this version can read.
 */
export function parseSnapshot(json: string): LoadResult & { exportedAt: number | null } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ImportError('The file isn’t valid JSON.');
  }
  const snapshot = data as Partial<Snapshot> | null;
  if (!snapshot || typeof snapshot !== 'object' || snapshot.app !== 'checklist') {
    throw new ImportError('The file isn’t a Checklist export.');
  }
  if (snapshot.version !== 1) {
    throw new ImportError('The file comes from a newer version of Checklist.');
  }
  if (!snapshot.tables || typeof snapshot.tables !== 'object') {
    throw new ImportError('The file has no data in it.');
  }

  const tables = emptyTables();
  for (const table of TABLE_NAMES) {
    const rows: unknown = snapshot.tables[table] ?? [];
    if (!Array.isArray(rows)) throw new ImportError(`The ${table} in the file aren’t a list.`);
    const target = tables[table] as Record<string, AnyRow>;
    rows.forEach((raw, i) => {
      const row = checkRow(table, raw, i);
      if (target[row.id]) throw new ImportError(`The file has two ${table} with the same id.`);
      target[row.id] = row;
    });
  }
  const settings = checkSettings(snapshot.settings);
  if (settings.defaultListId && !tables.lists[settings.defaultListId])
    settings.defaultListId = null;
  return {
    tables,
    settings,
    exportedAt: typeof snapshot.exportedAt === 'number' ? snapshot.exportedAt : null,
  };
}

/** How much a data set holds, for the import confirmation. */
export function describeContents(tables: Tables): string {
  const lists = Object.values(tables.lists).filter((l) => !l.deletedAt).length;
  const items = Object.values(tables.items).filter(
    (i) => !i.deletedAt && tables.lists[i.listId] && !tables.lists[i.listId].deletedAt,
  ).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${plural(lists, 'list')} and ${plural(items, 'item')}`;
}
