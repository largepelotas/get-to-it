import clsx from 'clsx';
import { Ellipsis, Plus, Tag } from 'lucide-react';
import { useMemo } from 'react';
import { newLabel, renameLabelTo } from '@/commands';
import { labelMenuEntries } from '@/components/menus';
import { ContextMenu, IconButton, Menu } from '@/components/ui';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { labelCounts, sortedLabels } from '@/store/labels';
import { openLabel, startRename, stopRename, useUI } from '@/store/ui';
import { RenameField } from './RenameField';
import { SectionHeader, SidebarItem } from './SidebarItem';

/** The sidebar's Labels area: shown once there is at least one label. */
export function LabelList() {
  const labelTable = useData((s) => s.tables.labels);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const view = useUI((s) => s.view);
  const renaming = useUI((s) => s.renaming);

  const labels = useMemo(() => sortedLabels(labelTable), [labelTable]);
  const counts = useMemo(() => labelCounts(items, lists), [items, lists]);
  if (!labels.length) return null;

  return (
    <>
      <SectionHeader label="Labels">
        <IconButton
          size="sm"
          label="New label"
          icon={<Plus className="size-4" />}
          onClick={newLabel}
        />
      </SectionHeader>
      {labels.map((label, index) => {
        const isRenaming = renaming?.kind === 'label' && renaming.id === label.id;
        const entries = () =>
          labelMenuEntries(label, {
            onRename: () => startRename({ kind: 'label', id: label.id }),
            first: index === 0,
            last: index === labels.length - 1,
          });
        return (
          <div key={label.id} className="group/folder relative">
            <ContextMenu entries={entries}>
              <SidebarItem
                className="group-focus-within/folder:pr-8 group-hover/folder:pr-8"
                active={view.kind === 'label' && view.labelId === label.id}
                onClick={() => openLabel(label.id)}
                onDoubleClick={() => startRename({ kind: 'label', id: label.id })}
                icon={
                  <Tag
                    aria-hidden
                    className={clsx('size-4 shrink-0', !label.color && 'text-fg-muted')}
                    style={{ color: colorVar(label.color) }}
                  />
                }
                label={label.name}
                count={counts.get(label.id)}
                editor={
                  isRenaming ? (
                    <RenameField
                      initial={label.name}
                      label="Label name"
                      onCommit={(name) => renameLabelTo(label.id, name)}
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
                    label={`${label.name} actions`}
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
