import clsx from 'clsx';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import type { SmartSection } from '@/components/items/SmartList';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { labelRows } from '@/store/labels';
import { SmartLayout } from './SmartViews';
import { EmptyState, ViewHeader } from './ViewHeader';

/**
 * Every open task that carries one label, from all your to-do lists. Tasks
 * added here get the label; a task that loses it leaves the view.
 */
export function LabelView({ labelId }: { labelId: string }) {
  const label = useData((s) => s.tables.labels[labelId]);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const rows = useMemo(() => labelRows(items, lists, labelId), [items, lists, labelId]);
  if (!label) return null;

  const sections: SmartSection[] = rows.length
    ? [{ key: label.name, title: label.name, rows, bare: true }]
    : [];

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
        />
      }
      labelIds={[labelId]}
      sections={sections}
      empty={<EmptyState title="No tasks with this label." />}
    />
  );
}
