import {
  DEFAULT_MATRIX,
  GROUP_KEYS,
  SORT_KEYS,
  VIEW_LAYOUTS,
  type GroupKey,
  type MatrixSettings,
  type Settings,
  type SortKey,
  type ViewLayout,
  type ViewOptions,
} from '@/data/types';
import type { View } from './ui';

/*
 * Sort and grouping per view: the pure side. The options live in
 * `Settings.viewOptions`, keyed by view; a view with no entry uses the
 * defaults for its kind. `setViewOptions` in commands.ts writes them.
 */

export const isSortKey = (v: unknown): v is SortKey => SORT_KEYS.includes(v as SortKey);
export const isGroupKey = (v: unknown): v is GroupKey => GROUP_KEYS.includes(v as GroupKey);
export const isViewLayout = (v: unknown): v is ViewLayout => VIEW_LAYOUTS.includes(v as ViewLayout);

/** The settings key of a view that can be sorted and grouped, or null for one that can't (Archive, Trash…). */
export function viewKey(view: View): string | null {
  switch (view.kind) {
    case 'today':
    case 'tomorrow':
    case 'next7':
    case 'upcoming':
      return view.kind;
    case 'list':
      return `list:${view.listId}`;
    case 'label':
      return `label:${view.labelId}`;
    case 'filter':
      return `filter:${view.filterId}`;
    default:
      return null;
  }
}

/** A list keeps its own order; every other view is by date. Grouping starts as the view's own. */
export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  sort: 'manual',
  group: 'default',
  layout: 'list',
};

export function sameViewOptions(a: ViewOptions, b: ViewOptions): boolean {
  return a.sort === b.sort && a.group === b.group && a.layout === b.layout;
}

/** The options a view uses: what was saved for it, with defaults for anything missing. */
export function viewOptionsFor(settings: Pick<Settings, 'viewOptions'>, view: View): ViewOptions {
  const key = viewKey(view);
  const saved = key ? settings.viewOptions[key] : undefined;
  return { ...DEFAULT_VIEW_OPTIONS, ...saved };
}

/** The sort a view actually applies: a smart view has no manual order, so `manual` there means by date. */
export function effectiveSort(view: View, sort: SortKey): Exclude<SortKey, 'manual'> | 'manual' {
  return sort === 'manual' && view.kind !== 'list' ? 'date' : sort;
}

/** Keeps the entries that are well formed and not just the defaults. Anything else is dropped. */
export function cleanViewOptions(raw: unknown): Record<string, ViewOptions> {
  const out: Record<string, ViewOptions> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const { sort, group, layout } = value as Record<string, unknown>;
    const options: ViewOptions = {
      sort: isSortKey(sort) ? sort : DEFAULT_VIEW_OPTIONS.sort,
      group: isGroupKey(group) ? group : DEFAULT_VIEW_OPTIONS.group,
      layout: isViewLayout(layout) ? layout : DEFAULT_VIEW_OPTIONS.layout,
    };
    if (!sameViewOptions(options, DEFAULT_VIEW_OPTIONS)) out[key] = options;
  }
  return out;
}

/** The matrix setting, if it is two strings; null for anything else. */
export function cleanMatrix(raw: unknown): MatrixSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const { urgent, important } = raw as Record<string, unknown>;
  if (typeof urgent !== 'string' || typeof important !== 'string') return null;
  return { urgent, important };
}

export { DEFAULT_MATRIX };
