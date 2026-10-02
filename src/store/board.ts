import type { GroupKey, Priority } from '@/data/types';
import { formatDateKey, fromDateKey, addDaysKey, type DateKey } from '@/lib/dates';
import { bySortKey } from '@/lib/order';
import { PRIORITY_ORDER, PRIORITY_TITLE, sectionOfRow, type GroupContext } from './arrange';
import { sortedLabels } from './labels';
import type { DueRow } from './smart';
import type { View } from './ui';

/*
 * Board columns: the pure side of a board view. Like `groupRows`, but every
 * column a card could be dropped into is present even when empty, and each
 * column says what a drop on it does.
 */

export type BoardGroup = Exclude<GroupKey, 'default' | 'none'>;

/** What dropping a card on the column does. Null: not a drop target. */
export type ColumnDrop =
  | { kind: 'section'; sectionId: string | null }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'date'; date: DateKey | null }
  | { kind: 'label'; labelId: string | null }
  | { kind: 'list'; listId: string };

export interface BoardColumn {
  /** The keys `groupRows` uses: `p1`, `section:<id>`, `no-label`, a date, `overdue`, `list:<id>`… */
  key: string;
  title: string;
  rows: DueRow[];
  tone?: 'danger';
  timeOnly?: boolean;
  drop: ColumnDrop | null;
}

/** The grouping a board uses when the view's choice is `default` or `none`. */
export function boardGroup(view: View, group: GroupKey): BoardGroup {
  if (group !== 'default' && group !== 'none') return group;
  if (view.kind === 'list') return 'section';
  return view.kind === 'next7' || view.kind === 'upcoming' ? 'date' : 'priority';
}

/** Columns for a board. Unlike groupRows, the columns a drop could land in are all present, empty or not. */
export function boardColumns(rows: DueRow[], group: BoardGroup, ctx: GroupContext): BoardColumn[] {
  switch (group) {
    case 'priority':
      return PRIORITY_ORDER.map((p) => ({
        key: `p${p}`,
        title: PRIORITY_TITLE[p],
        rows: rows.filter((r) => (r.item.priority || 0) === p),
        drop: { kind: 'priority', priority: p as Priority },
      }));
    case 'section': {
      const sections = Object.values(ctx.sections ?? {})
        .filter((s) => s.listId === ctx.listId)
        .sort(bySortKey);
      const known = new Set(sections.map((s) => s.id));
      const sectionOf = (r: DueRow) => sectionOfRow(r, ctx, known);
      return [
        {
          key: 'no-section',
          title: 'No section',
          rows: rows.filter((r) => !sectionOf(r)),
          drop: { kind: 'section', sectionId: null },
        },
        ...sections.map((s) => ({
          key: `section:${s.id}`,
          title: s.title,
          rows: rows.filter((r) => sectionOf(r) === s.id),
          drop: { kind: 'section', sectionId: s.id } as ColumnDrop,
        })),
      ];
    }
    case 'label': {
      // A task with several labels sits under the first of them in label order, as in groupRows.
      const placed = new Set<string>();
      const columns: BoardColumn[] = sortedLabels(ctx.labels).map((label) => {
        const mine = rows.filter(
          (r) => !placed.has(r.item.id) && (r.item.labelIds ?? []).includes(label.id),
        );
        for (const r of mine) placed.add(r.item.id);
        return {
          key: `label:${label.id}`,
          title: label.name,
          rows: mine,
          drop: { kind: 'label', labelId: label.id },
        };
      });
      columns.push({
        key: 'no-label',
        title: 'No label',
        rows: rows.filter((r) => !placed.has(r.item.id)),
        drop: { kind: 'label', labelId: null },
      });
      return columns;
    }
    case 'date': {
      const now = fromDateKey(ctx.today);
      const overdue = rows.filter((r) => r.item.dueDate && r.item.dueDate < ctx.today);
      const days = new Set<DateKey>([ctx.today, addDaysKey(ctx.today, 1)]);
      for (const r of rows)
        if (r.item.dueDate && r.item.dueDate >= ctx.today) days.add(r.item.dueDate);
      const columns: BoardColumn[] = [];
      if (overdue.length) {
        columns.push({
          key: 'overdue',
          title: 'Overdue',
          rows: overdue,
          tone: 'danger',
          drop: null,
        });
      }
      for (const date of [...days].sort()) {
        columns.push({
          key: date,
          title: formatDateKey(date, now),
          rows: rows.filter((r) => r.item.dueDate === date),
          timeOnly: true,
          drop: { kind: 'date', date },
        });
      }
      columns.push({
        key: 'no-date',
        title: 'No date',
        rows: rows.filter((r) => !r.item.dueDate),
        drop: { kind: 'date', date: null },
      });
      return columns;
    }
    case 'list': {
      const lists = [...new Set(rows.map((r) => r.list))].sort(bySortKey);
      return lists.map((list) => ({
        key: `list:${list.id}`,
        title: list.title,
        rows: rows.filter((r) => r.list.id === list.id),
        drop: { kind: 'list', listId: list.id },
      }));
    }
  }
}
