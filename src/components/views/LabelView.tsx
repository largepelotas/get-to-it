import clsx from 'clsx';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import type { SmartSection } from '@/components/items/SmartList';
import { useToday } from '@/hooks/useToday';
import { colorVar } from '@/lib/theme';
import { groupRows, sortRows } from '@/store/arrange';
import { useData } from '@/store/data';
import { labelRows } from '@/store/labels';
import type { View } from '@/store/ui';
import { SmartLayout } from './SmartViews';
import { EmptyState, ViewHeader } from './ViewHeader';
import { groupChoices, SMART_SORTS, toSmartSections, useViewOptions } from './arrangement';
import { ViewOptionsMenu } from './viewOptions';

/**
 * Every open task that carries one label, from all your to-do lists. Tasks
 * added here get the label; a task that loses it leaves the view.
 */
export function LabelView({ labelId }: { labelId: string }) {
  const label = useData((s) => s.tables.labels[labelId]);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const rows = useMemo(() => labelRows(items, lists, labelId), [items, lists, labelId]);
  const view = useMemo<View>(() => ({ kind: 'label', labelId }), [labelId]);
  const { sort, group } = useViewOptions(view);
  const sections = useMemo<SmartSection[]>(() => {
    const sorted = sortRows(rows, sort);
    if (group === 'default' || group === 'none') {
      return sorted.length ? [{ key: 'all', title: 'All tasks', rows: sorted, bare: true }] : [];
    }
    return toSmartSections(groupRows(sorted, group, { today, lists, labels }));
  }, [rows, sort, group, today, lists, labels]);
  if (!label) return null;

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={
            <Tag
              aria-hidden
              className={clsx('size-6', !label.color && 'text-fg-muted')}
              style={{ color: colorVar(label.color) }}
            />
          }
          title={label.name}
          subtitle={
            rows.length > 0 ? (
              <span className="text-fg-subtle">
                {rows.length === 1 ? '1 task' : `${rows.length} tasks`}
              </span>
            ) : undefined
          }
          actions={<ViewOptionsMenu view={view} sorts={SMART_SORTS} groups={groupChoices(null)} />}
        />
      }
      labelIds={[labelId]}
      sections={sections}
      empty={<EmptyState title="No tasks with this label." />}
    />
  );
}
