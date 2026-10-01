import type { GroupKey, Label, List, Section, SortKey } from '@/data/types';
import { formatDateKey, formatLongDate, type DateKey } from '@/lib/dates';
import { bySortKey } from '@/lib/order';
import { sortedLabels } from './labels';
import { compareDue, type DueRow } from './smart';

/*
 * Sorting and grouping for any view's rows. A view works out its rows, sorts
 * them with `sortRows`, then either groups them its own way (Today's Overdue
 * and Today, Upcoming's days, a list's sections) or hands them to `groupRows`.
 */

const PRIORITY_ORDER = [1, 2, 3, 0];
const PRIORITY_TITLE: Record<number, string> = {
  1: 'Priority 1',
  2: 'Priority 2',
  3: 'Priority 3',
  0: 'No priority',
};

/** Today's order (date, time, priority, list, position), with undated tasks last rather than first. */
export function byDate(a: DueRow, b: DueRow): number {
  if (!a.item.dueDate !== !b.item.dueDate) return a.item.dueDate ? -1 : 1;
  return compareDue(a, b);
}
const byName = (a: DueRow, b: DueRow) =>
  a.item.text.localeCompare(b.item.text, undefined, { sensitivity: 'base' }) || byDate(a, b);
const byPriority = (a: DueRow, b: DueRow) =>
  (a.item.priority || 4) - (b.item.priority || 4) || byDate(a, b);
const byAdded = (a: DueRow, b: DueRow) => a.item.createdAt - b.item.createdAt || byDate(a, b);

/** The rows in the chosen order. `manual` keeps the order given (the list's own). */
export function sortRows(rows: DueRow[], sort: SortKey): DueRow[] {
  switch (sort) {
    case 'date':
      return [...rows].sort(byDate);
    case 'priority':
      return [...rows].sort(byPriority);
    case 'name':
      return [...rows].sort(byName);
    case 'added':
      return [...rows].sort(byAdded);
    default:
      return rows;
  }
}

export interface RowGroup {
  key: string;
  title: string;
  rows: DueRow[];
  tone?: 'danger';
  /** The heading names the day, so rows need only show their time. */
  timeOnly?: boolean;
  /** No heading. */
  bare?: boolean;
}

export interface GroupContext {
  today: DateKey;
  lists: Record<string, List>;
  labels: Record<string, Label>;
  /** For grouping a list by its sections. */
  sections?: Record<string, Section>;
  listId?: string;
}

/** Heading for a day: relative word plus the long date, as the date views write them. */
export function dayTitle(date: DateKey, today: DateKey): string {
  const long = formatLongDate(date);
  if (date < today) return `Overdue · ${long}`;
  const relative = formatDateKey(date);
  return date === today || relative === 'Tomorrow' ? `${relative} · ${long}` : long;
}

/**
 * Splits rows (already sorted) into groups, keeping each row's place within
 * its group. Empty groups are left out; with `none` (or `default`) there is
 * one bare group, or none when there are no rows.
 */
export function groupRows(rows: DueRow[], group: GroupKey, ctx: GroupContext): RowGroup[] {
  if (!rows.length) return [];
  switch (group) {
    case 'date': {
      const dated = new Map<DateKey, DueRow[]>();
      const undated: DueRow[] = [];
      for (const row of rows) {
        const date = row.item.dueDate;
        if (!date) undated.push(row);
        else dated.set(date, [...(dated.get(date) ?? []), row]);
      }
      const groups: RowGroup[] = [...dated.keys()].sort().map((date) => ({
        key: date,
        title: dayTitle(date, ctx.today),
        rows: dated.get(date)!,
        tone: date < ctx.today ? 'danger' : undefined,
        timeOnly: true,
      }));
      if (undated.length) groups.push({ key: 'no-date', title: 'No date', rows: undated });
      return groups;
    }
    case 'priority':
      return PRIORITY_ORDER.map((p) => ({
        key: `p${p}`,
        title: PRIORITY_TITLE[p],
        rows: rows.filter((r) => (r.item.priority || 0) === p),
      })).filter((g) => g.rows.length);
    case 'list': {
      const lists = [...new Set(rows.map((r) => r.list))].sort(bySortKey);
      return lists.map((list) => ({
        key: `list:${list.id}`,
        title: list.title,
        rows: rows.filter((r) => r.list.id === list.id),
      }));
    }
    case 'label': {
      // A task with several labels is shown once, under the first of them in label order.
      const labels = sortedLabels(ctx.labels);
      const placed = new Set<string>();
      const groups: RowGroup[] = [];
      for (const label of labels) {
        const mine = rows.filter(
          (r) => !placed.has(r.item.id) && (r.item.labelIds ?? []).includes(label.id),
        );
        if (!mine.length) continue;
        for (const r of mine) placed.add(r.item.id);
        groups.push({ key: `label:${label.id}`, title: label.name, rows: mine });
      }
      const rest = rows.filter((r) => !placed.has(r.item.id));
      if (rest.length) groups.push({ key: 'no-label', title: 'No label', rows: rest });
      return groups;
    }
    case 'section': {
      const sections = Object.values(ctx.sections ?? {})
        .filter((s) => s.listId === ctx.listId)
        .sort(bySortKey);
      const known = new Set(sections.map((s) => s.id));
      // A subtask follows its parent's section; a task naming a missing section is unsectioned.
      const sectionOf = (r: DueRow) => {
        const top = r.parent ?? r.item;
        return top.sectionId && known.has(top.sectionId) ? top.sectionId : null;
      };
      const groups: RowGroup[] = [];
      const loose = rows.filter((r) => !sectionOf(r));
      if (loose.length)
        groups.push({ key: 'no-section', title: 'No section', rows: loose, bare: true });
      for (const section of sections) {
        const mine = rows.filter((r) => sectionOf(r) === section.id);
        if (mine.length)
          groups.push({ key: `section:${section.id}`, title: section.title, rows: mine });
      }
      return groups;
    }
    default:
      return [{ key: 'all', title: 'All tasks', rows, bare: true }];
  }
}
