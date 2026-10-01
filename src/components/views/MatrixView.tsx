import { LayoutGrid, Settings as SettingsIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { SmartSection } from '@/components/items/SmartList';
import { Button, IconButton } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { MATRIX_BOXES, MATRIX_HINT, MATRIX_TITLE, matrixModel } from '@/store/filters';
import { openDialog } from '@/store/ui';
import { SmartLayout } from './SmartViews';
import { EmptyState, ViewHeader } from './ViewHeader';

/**
 * The Eisenhower matrix: every open task in one of four boxes, by whether it
 * passes the "urgent" and "important" searches set in Settings.
 */
export function MatrixView() {
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const matrix = useData((s) => s.settings.matrix);
  const today = useToday();
  const model = useMemo(
    () => matrixModel({ items, lists, labels }, matrix, today),
    [items, lists, labels, matrix, today],
  );

  const sections: SmartSection[] = model.ok
    ? MATRIX_BOXES.map((box) => ({
        key: box,
        label: MATRIX_TITLE[box],
        title: (
          <>
            <span>{MATRIX_TITLE[box]}</span>
            <span className="truncate font-normal text-fg-subtle">{MATRIX_HINT[box]}</span>
          </>
        ),
        rows: model.boxes[box],
        emptyText: 'Nothing here.',
      }))
    : [];
  const count = model.ok ? MATRIX_BOXES.reduce((sum, box) => sum + model.boxes[box].length, 0) : 0;
  const openSettings = () => openDialog({ kind: 'settings' });

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={<LayoutGrid className="size-6" style={{ color: colorVar('indigo') }} />}
          title="Eisenhower matrix"
          subtitle={
            <>
              Urgent: <code className="text-fg">{matrix.urgent}</code>
              <span aria-hidden> · </span>Important:{' '}
              <code className="text-fg">{matrix.important}</code>
              {count > 0 && (
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
            <IconButton
              label="Matrix settings"
              icon={<SettingsIcon className="size-4" />}
              onClick={openSettings}
            />
          }
        />
      }
      grid
      sections={sections}
      empty={
        model.ok ? (
          <EmptyState title="No open tasks">
            Every open task from your to-do lists is sorted into four boxes here.
          </EmptyState>
        ) : (
          <EmptyState title="The matrix can’t run.">
            <p role="alert">
              The “{model.which}” search: {model.error}
            </p>
            <Button size="sm" className="mt-3" onClick={openSettings}>
              Open Settings
            </Button>
          </EmptyState>
        )
      }
    />
  );
}
