import clsx from 'clsx';
import { Ellipsis, Funnel, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { newFilter, renameFilterTo } from '@/commands';
import { filterMenuEntries } from '@/components/menus';
import { ContextMenu, IconButton, Menu } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { filterCounts, sortedFilters } from '@/store/filters';
import { openFilter, startRename, stopRename, useUI } from '@/store/ui';
import { RenameField } from './RenameField';
import { SectionHeader, SidebarItem } from './SidebarItem';

/** The sidebar's Filters area: shown once there is at least one saved filter. */
export function FilterList() {
  const filterTable = useData((s) => s.tables.filters);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const view = useUI((s) => s.view);
  const renaming = useUI((s) => s.renaming);

  const filters = useMemo(() => sortedFilters(filterTable), [filterTable]);
  const counts = useMemo(
    () => filterCounts({ items, lists, labels, filters: filterTable }, today),
    [items, lists, labels, filterTable, today],
  );
  if (!filters.length) return null;

  return (
    <>
      <SectionHeader label="Filters">
        <IconButton
          size="sm"
          label="New filter"
          icon={<Plus className="size-4" />}
          onClick={newFilter}
        />
      </SectionHeader>
      {filters.map((filter, index) => {
        const isRenaming = renaming?.kind === 'filter' && renaming.id === filter.id;
        const entries = () =>
          filterMenuEntries(filter, {
            onRename: () => startRename({ kind: 'filter', id: filter.id }),
            first: index === 0,
            last: index === filters.length - 1,
          });
        return (
          <div key={filter.id} className="group/folder relative">
            <ContextMenu entries={entries}>
              <SidebarItem
                className="group-focus-within/folder:pr-8 group-hover/folder:pr-8"
                active={view.kind === 'filter' && view.filterId === filter.id}
                onClick={() => openFilter(filter.id)}
                onDoubleClick={() => startRename({ kind: 'filter', id: filter.id })}
                icon={
                  <Funnel
                    aria-hidden
                    className={clsx('size-4 shrink-0', !filter.color && 'text-fg-muted')}
                    style={{ color: colorVar(filter.color) }}
                  />
                }
                label={filter.name}
                count={counts.get(filter.id)}
                editor={
                  isRenaming ? (
                    <RenameField
                      initial={filter.name}
                      label="Filter name"
                      onCommit={(name) => renameFilterTo(filter.id, name)}
                      onDone={stopRename}
                    />
                  ) : undefined
                }
              />
            </ContextMenu>
            {!isRenaming && (
              <Menu
                align="start"
                entries={entries}
                trigger={
                  <IconButton
                    size="sm"
                    label={`${filter.name} actions`}
                    tooltip={false}
                    icon={<Ellipsis className="size-3.5" />}
                    className="absolute top-0.5 right-0.5 opacity-0 group-focus-within/folder:opacity-100 group-hover/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  />
                }
              />
            )}
          </div>
        );
      })}
    </>
  );
}
