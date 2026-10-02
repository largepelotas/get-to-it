import clsx from 'clsx';
import { useMemo, useRef } from 'react';
import { EmptyState } from '@/components/views/ViewHeader';
import { groupRows, sortRows } from '@/store/arrange';
import { boardColumns, boardGroup, type BoardColumn } from '@/store/board';
import { toSmartSections } from '@/components/views/arrangement';
import type { GroupKey, List, SortKey, ViewLayout } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { ListIcon } from '@/components/ListIcon';
import { useData } from '@/store/data';
import type { DueRow } from '@/store/smart';
import { buildTree, flatten } from '@/store/tree';
import { todoModel } from '@/store/todo';
import { useUI } from '@/store/ui';
import { Board } from './Board';
import { QuickAdd } from './QuickAdd';
import { SmartList, type SmartSection } from './SmartList';

/**
 * A to-do list sorted or grouped some way other than its own: a flat list of
 * its open tasks, like Today's, that can't be dragged or nested. Completed
 * tasks stay in the list's own order.
 */
export function ArrangedTodoList({
  list,
  sort,
  group,
  layout = 'list',
}: {
  list: List;
  sort: SortKey;
  group: GroupKey;
  layout?: ViewLayout;
}) {
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const sectionTable = useData((s) => s.tables.sections);
  const today = useToday();
  const several = useUI((s) => s.multiSelectedIds.length >= 2);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const model = useMemo(
    () => todoModel(items, list.id, sectionTable),
    [items, list.id, sectionTable],
  );
  const { sections, columns } = useMemo<{
    sections: SmartSection[];
    columns: BoardColumn[] | null;
  }>(() => {
    // Every open task of the list, subtasks of collapsed parents included, as rows Today
    // would show, so the same sorts and groups apply. List order is the tree order.
    const live = Object.values(items).filter((i) => i.listId === list.id && !i.deletedAt);
    const rows: DueRow[] = flatten(
      buildTree(live).filter((n) => !n.item.checked),
      0,
      [],
      true,
    )
      .filter((row) => !row.item.checked)
      .map((row) => ({
        ...row,
        depth: 0,
        list,
        parent: (row.item.parentId && items[row.item.parentId]) || null,
      }));
    const sorted = sortRows(rows, sort);
    const ctx = {
      today,
      lists,
      labels,
      sections: sectionTable,
      items,
      listId: list.id,
    };
    if (layout === 'board') {
      return {
        sections: [],
        columns: boardColumns(sorted, boardGroup({ kind: 'list', listId: list.id }, group), ctx),
      };
    }
    const grouped = groupRows(sorted, group === 'default' ? 'section' : group, ctx);
    return { sections: toSmartSections(grouped), columns: null };
  }, [sort, group, layout, list, items, lists, labels, sectionTable, today]);

  return (
    <div className={clsx('px-6', several ? 'pb-24' : 'pb-10')}>
      <div className="px-2">
        <QuickAdd
          listId={list.id}
          inputRef={quickAddRef}
          onArrowDown={() => listRef.current?.querySelector<HTMLElement>('[data-item-id]')?.focus()}
        />
      </div>
      {columns ? (
        <div ref={listRef} className="mt-4 px-2">
          <Board
            columns={columns}
            homeListId={list.id}
            onExitTop={() => quickAddRef.current?.focus()}
          />
        </div>
      ) : sections.length ? (
        <div ref={listRef} className="mt-4 px-2">
          <SmartList
            sections={sections}
            homeListId={list.id}
            onExitTop={() => quickAddRef.current?.focus()}
          />
        </div>
      ) : (
        <EmptyState icon={<ListIcon type="todo" className="size-8" />} title="No open tasks">
          Add one above.
        </EmptyState>
      )}
      {model.doneCount > 0 && (
        <p className="px-2 py-3 text-xs text-fg-subtle">
          {model.doneCount === 1
            ? '1 completed task isn’t'
            : `${model.doneCount} completed tasks aren’t`}{' '}
          shown while the list is sorted or grouped.
        </p>
      )}
    </div>
  );
}
