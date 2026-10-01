import type { Filter, Item, Label, List, MatrixSettings, Tables } from '@/data/types';
import type { DateKey } from '@/lib/dates';
import {
  buildFilter,
  filterDefaults,
  parseFilter,
  type CompileResult,
  type FilterContext,
  type FilterDefaults,
} from '@/lib/filterQuery';
import { bySortKey } from '@/lib/order';
import { openRows, type DueRow } from './smart';

/*
 * Filters: the pure side. Compiling a saved query against the data, the rows
 * of a filter's view, the sidebar counts and the Eisenhower matrix. The
 * actions that change filters are in actions/filters.ts.
 */

/** Filters in the order the user arranged them. */
export function sortedFilters(filters: Record<string, Filter> | Filter[]): Filter[] {
  return [...(Array.isArray(filters) ? filters : Object.values(filters))].sort(bySortKey);
}

const isLiveTodo = (list: List) => list.type === 'todo' && !list.deletedAt && !list.archivedAt;

/** What a query is read against: today, and the live to-do lists and labels by name. */
export function filterContext(
  tables: Pick<Tables, 'lists' | 'labels'>,
  today: DateKey,
  now?: Date,
): FilterContext {
  return {
    today,
    now,
    lists: Object.values(tables.lists).filter(isLiveTodo),
    labels: Object.values(tables.labels),
  };
}

/** Compiles a query against the data; an error names what's wrong. */
export function compileQuery(
  query: string,
  tables: Pick<Tables, 'lists' | 'labels'>,
  today: DateKey,
): CompileResult {
  return buildFilter(query, filterContext(tables, today));
}

/** Every open task that passes the compiled query, from live to-do lists, in the order Today uses. */
export function filterRows(
  items: Record<string, Item>,
  lists: Record<string, List>,
  match: (item: Item) => boolean,
): DueRow[] {
  return openRows(items, lists, match);
}

/** How many open tasks each filter matches, for the sidebar. A filter that doesn't compile has no count. */
export function filterCounts(
  tables: Pick<Tables, 'items' | 'lists' | 'labels' | 'filters'>,
  today: DateKey,
): Map<string, number> {
  const counts = new Map<string, number>();
  const all = openRows(tables.items, tables.lists, () => true);
  for (const filter of Object.values(tables.filters)) {
    const compiled = compileQuery(filter.query, tables, today);
    if (compiled.ok) counts.set(filter.id, all.filter((r) => compiled.match(r.item)).length);
  }
  return counts;
}

export interface ResolvedDefaults {
  listId: string | null;
  labelIds: string[];
  due: FilterDefaults['due'];
  priority: FilterDefaults['priority'];
}

/** What a task added in the filter's view gets, with list and label names turned into ids. */
export function resolvedDefaults(
  query: string,
  tables: Pick<Tables, 'lists' | 'labels'>,
): ResolvedDefaults {
  const none: ResolvedDefaults = { listId: null, labelIds: [], due: null, priority: null };
  const parsed = parseFilter(query);
  if (!parsed.ok) return none;
  const wanted = filterDefaults(parsed.node);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const list = wanted.listName
    ? Object.values(tables.lists).find((l) => isLiveTodo(l) && same(l.title, wanted.listName!))
    : undefined;
  const labels: Label[] = Object.values(tables.labels);
  return {
    listId: list?.id ?? null,
    labelIds: wanted.labelNames.flatMap((name) => labels.find((l) => same(l.name, name))?.id ?? []),
    due: wanted.due,
    priority: wanted.priority,
  };
}

export const MATRIX_BOXES = ['do', 'schedule', 'delegate', 'drop'] as const;
export type MatrixBox = (typeof MATRIX_BOXES)[number];

export const MATRIX_TITLE: Record<MatrixBox, string> = {
  do: 'Urgent and important',
  schedule: 'Important, not urgent',
  delegate: 'Urgent, not important',
  drop: 'Neither',
};

export const MATRIX_HINT: Record<MatrixBox, string> = {
  do: 'Do these first.',
  schedule: 'Plan a time for these.',
  delegate: 'Fit these in, or hand them on.',
  drop: 'Do these later, or not at all.',
};

export type MatrixModel =
  | { ok: true; boxes: Record<MatrixBox, DueRow[]> }
  | { ok: false; which: 'urgent' | 'important'; error: string };

/**
 * Every open task from live to-do lists sorted into the four boxes of the
 * Eisenhower matrix by the two saved searches: urgent and important.
 */
export function matrixModel(
  tables: Pick<Tables, 'items' | 'lists' | 'labels'>,
  matrix: MatrixSettings,
  today: DateKey,
): MatrixModel {
  const urgent = compileQuery(matrix.urgent, tables, today);
  if (!urgent.ok) return { ok: false, which: 'urgent', error: urgent.error };
  const important = compileQuery(matrix.important, tables, today);
  if (!important.ok) return { ok: false, which: 'important', error: important.error };
  const boxes: Record<MatrixBox, DueRow[]> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const row of openRows(tables.items, tables.lists, () => true)) {
    const u = urgent.match(row.item);
    const i = important.match(row.item);
    boxes[u && i ? 'do' : i ? 'schedule' : u ? 'delegate' : 'drop'].push(row);
  }
  return { ok: true, boxes };
}
