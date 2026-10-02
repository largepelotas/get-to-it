import { setViewOptions } from '@/commands';
import type { SmartSection } from '@/components/items/SmartList';
import type { GroupKey, SortKey, ViewLayout, ViewOptions } from '@/data/types';
import { sortRows, type RowGroup } from '@/store/arrange';
import { boardColumns, boardGroup, type BoardColumn } from '@/store/board';
import type { DueRow } from '@/store/smart';
import { useToday } from '@/hooks/useToday';
import { useMemo } from 'react';
import { useData } from '@/store/data';
import type { View } from '@/store/ui';
import { effectiveSort, viewOptionsFor } from '@/store/viewOptions';

/*
 * Sort and group choices for the views, and the hook that reads a view's saved
 * choice. The menu itself is in viewOptions.tsx.
 */

export interface Choice<K> {
  key: K;
  label: string;
}

/** The sorts of a view with no order of its own (Today, a label, a filter). */
export const SMART_SORTS: Choice<SortKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Date added' },
];

/** The sorts of a list: its own order first. */
export const LIST_SORTS: Choice<SortKey>[] = [
  { key: 'manual', label: 'List order' },
  ...SMART_SORTS,
];

const GROUPS: Choice<GroupKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'list', label: 'List' },
  { key: 'label', label: 'Label' },
];

/**
 * The groupings of a view. `defaultLabel` names the view's own grouping
 * ("Overdue and today", "Day"), shown first; null when the view has none,
 * so "None" is the default. A list can't be grouped by list.
 */
export function groupChoices(defaultLabel: string | null, inList = false): Choice<GroupKey>[] {
  const own: Choice<GroupKey>[] = defaultLabel
    ? [
        { key: 'default', label: defaultLabel },
        { key: 'none', label: 'None' },
      ]
    : [{ key: 'default', label: 'None' }];
  return [...own, ...GROUPS.filter((g) => !(inList && g.key === 'list'))];
}

/** The view's sort and grouping as it should apply them, plus a setter. */
export function useViewOptions(view: View): {
  options: ViewOptions;
  sort: SortKey;
  group: GroupKey;
  layout: ViewLayout;
  set: (options: ViewOptions) => void;
} {
  const viewOptions = useData((s) => s.settings.viewOptions);
  const options = viewOptionsFor({ viewOptions }, view);
  return {
    options,
    sort: effectiveSort(view, options.sort),
    group: options.group,
    layout: options.layout,
    set: (next) => setViewOptions(view, next),
  };
}

/** Groups from `groupRows` as the sections `SmartList` draws. */
export function toSmartSections(groups: RowGroup[]): SmartSection[] {
  return groups.map((g) => ({
    key: g.key,
    title: g.title,
    rows: g.rows,
    tone: g.tone,
    timeOnly: g.timeOnly,
    bare: g.bare,
  }));
}

/**
 * The columns of a smart view shown as a board, or null while it is a list.
 * `rows` is every row the view would list.
 */
export function useBoard(view: View, rows: DueRow[]): BoardColumn[] | null {
  const { sort, group, layout } = useViewOptions(view);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  return useMemo(
    () =>
      layout === 'board'
        ? boardColumns(sortRows(rows, sort), boardGroup(view, group), { today, lists, labels })
        : null,
    [layout, rows, sort, view, group, today, lists, labels],
  );
}
