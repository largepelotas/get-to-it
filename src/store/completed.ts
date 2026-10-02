import type { Tables } from '@/data/types';
import { toDateKey, type DateKey } from '@/lib/dates';

/*
 * Completed entries: every finished task across the to-do lists, worked out
 * from the tasks and the repeat completions already stored. Nothing is saved.
 */

export type CompletedKind = 'done' | 'wontDo' | 'repeat';

export interface CompletedEntry {
  /** Unique and stable: `item:<id>` or `completion:<id>`. */
  key: string;
  itemId: string;
  /** The task's text now. */
  text: string;
  listId: string;
  completedAt: number;
  /** Local day of `completedAt`. */
  day: DateKey;
  kind: CompletedKind;
}

/** Every finished task, newest first. Deleted tasks, trashed lists and non-to-do lists are left out; archived lists stay in. */
export function completedEntries(
  tables: Pick<Tables, 'items' | 'lists' | 'completions'>,
): CompletedEntry[] {
  const { items, lists, completions } = tables;
  const counts = (listId: string) => {
    const list = lists[listId];
    return !!list && list.type === 'todo' && list.deletedAt === null;
  };
  const out: CompletedEntry[] = [];
  for (const item of Object.values(items)) {
    if (item.deletedAt !== null || !counts(item.listId)) continue;
    if (!item.checked || item.completedAt === null) continue;
    out.push({
      key: `item:${item.id}`,
      itemId: item.id,
      text: item.text,
      listId: item.listId,
      completedAt: item.completedAt,
      day: toDateKey(new Date(item.completedAt)),
      kind: item.wontDo ? 'wontDo' : 'done',
    });
  }
  for (const c of Object.values(completions)) {
    const item = items[c.itemId];
    if (!item || item.deletedAt !== null || !counts(item.listId)) continue;
    out.push({
      key: `completion:${c.id}`,
      itemId: item.id,
      text: item.text,
      listId: item.listId,
      completedAt: c.completedAt,
      day: toDateKey(new Date(c.completedAt)),
      kind: 'repeat',
    });
  }
  return out.sort((a, b) => b.completedAt - a.completedAt || a.key.localeCompare(b.key));
}

/** Entries grouped by day: newest day first, newest entry first within a day. */
export function groupByDay(
  entries: CompletedEntry[],
): { day: DateKey; entries: CompletedEntry[] }[] {
  const byDay = new Map<DateKey, CompletedEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.day);
    if (list) list.push(e);
    else byDay.set(e.day, [e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({
      day,
      entries: list.sort((a, b) => b.completedAt - a.completedAt || a.key.localeCompare(b.key)),
    }));
}
