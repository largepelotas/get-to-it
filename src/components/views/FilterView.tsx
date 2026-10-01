import clsx from 'clsx';
import { Funnel, Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { editFilter } from '@/commands';
import type { SmartSection } from '@/components/items/SmartList';
import { Button, IconButton } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { addDaysKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { groupRows, sortRows } from '@/store/arrange';
import { useData } from '@/store/data';
import { compileQuery, filterRows, resolvedDefaults } from '@/store/filters';
import type { View } from '@/store/ui';
import { SmartLayout } from './SmartViews';
import { EmptyState, ViewHeader } from './ViewHeader';
import { groupChoices, SMART_SORTS, toSmartSections, useViewOptions } from './arrangement';
import { ViewOptionsMenu } from './viewOptions';

/**
 * Every open task that passes a saved filter's query, from all your to-do
 * lists. Tasks added here get what the query asks for (a label, a list, a
 * day, a priority) so they show up; one that stops matching leaves the view.
 */
export function FilterView({ filterId }: { filterId: string }) {
  const filter = useData((s) => s.tables.filters[filterId]);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const view = useMemo<View>(() => ({ kind: 'filter', filterId }), [filterId]);
  const { sort, group } = useViewOptions(view);
  const query = filter?.query ?? '';

  const compiled = useMemo(
    () => compileQuery(query, { lists, labels }, today),
    [query, lists, labels, today],
  );
  const rows = useMemo(
    () => (compiled.ok ? filterRows(items, lists, compiled.match) : []),
    [compiled, items, lists],
  );
  const defaults = useMemo(
    () => resolvedDefaults(query, { lists, labels }),
    [query, lists, labels],
  );
  const sections = useMemo<SmartSection[]>(() => {
    const sorted = sortRows(rows, sort);
    if (group === 'default' || group === 'none') {
      return sorted.length ? [{ key: 'all', title: 'All tasks', rows: sorted, bare: true }] : [];
    }
    return toSmartSections(groupRows(sorted, group, { today, lists, labels }));
  }, [rows, sort, group, today, lists, labels]);
  if (!filter) return null;

  const count = rows.length;
  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={
            <Funnel
              aria-hidden
              className={clsx('size-6', !filter.color && 'text-fg-muted')}
              style={{ color: colorVar(filter.color) }}
            />
          }
          title={filter.name}
          subtitle={
            <>
              <code className="rounded bg-hover px-1 py-px text-[12px] text-fg">
                {filter.query}
              </code>
              {compiled.ok && count > 0 && (
                <>
                  <span aria-hidden> · </span>
                  <span className="text-fg-subtle">
                    {count === 1 ? '1 task' : `${count} tasks`}
                  </span>
                </>
              )}
            </>
          }
          actions={
            <>
              <IconButton
                label="Edit filter"
                icon={<Pencil className="size-4" />}
                onClick={() => editFilter(filter.id)}
              />
              <ViewOptionsMenu view={view} sorts={SMART_SORTS} groups={groupChoices(null)} />
            </>
          }
        />
      }
      listId={defaults.listId}
      labelIds={defaults.labelIds}
      defaultDue={
        defaults.due === 'today'
          ? today
          : defaults.due === 'tomorrow'
            ? addDaysKey(today, 1)
            : undefined
      }
      defaultPriority={defaults.priority ?? undefined}
      sections={sections}
      empty={
        compiled.ok ? (
          <EmptyState title="No tasks match this filter." />
        ) : (
          <EmptyState title="This filter can’t run.">
            <p role="alert">{compiled.error}</p>
            <Button size="sm" className="mt-3" onClick={() => editFilter(filter.id)}>
              Change the search
            </Button>
          </EmptyState>
        )
      }
    />
  );
}
