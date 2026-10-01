import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { ChevronRight, Ellipsis, Folder as FolderIcon, FolderOpen } from 'lucide-react';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ListIcon } from '@/components/ListIcon';
import { folderMenuEntries, listMenuEntries } from '@/components/menus';
import { ContextMenu, IconButton, Menu } from '@/components/ui';
import { colorVar } from '@/lib/theme';
import { moveFolder, renameFolder, setFolderCollapsed } from '@/store/actions/folders';
import { moveList, renameList } from '@/store/actions/lists';
import {
  resolveSidebarDrop,
  sidebarRows,
  type SidebarModel,
  type SidebarRow,
} from '@/store/sidebar';
import { openList, startRename, stopRename, useUI } from '@/store/ui';
import { RenameField } from './RenameField';
import { SidebarItem } from './SidebarItem';

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Space picks a row up; Enter is left free to open it. */
const keyboardCodes = {
  start: ['Space'],
  cancel: ['Escape'],
  end: ['Space', 'Enter'],
};

function Sortable({
  row,
  children,
}: {
  row: SidebarRow;
  children: (props: {
    ref: (el: HTMLElement | null) => void;
    style: CSSProperties;
    dragging: boolean;
    handle: Record<string, unknown>;
  }) => ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: row.key,
  });
  return children({
    ref: setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      position: 'relative',
      zIndex: isDragging ? 10 : undefined,
    },
    dragging: isDragging,
    // role/tabIndex come from SidebarItem; keep dnd-kit's ARIA description.
    handle: {
      'aria-roledescription': attributes['aria-roledescription'],
      'aria-describedby': attributes['aria-describedby'],
      'aria-pressed': attributes['aria-pressed'],
      ...listeners,
    },
  });
}

export interface ListTreeProps {
  model: SidebarModel;
  counts: Map<string, number>;
}

/** Top-level lists and folders with their lists, reorderable by dragging. */
export function ListTree({ model, counts }: ListTreeProps) {
  const view = useUI((s) => s.view);
  const renaming = useUI((s) => s.renaming);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const justDropped = useRef(false);

  const draggingFolder = activeKey?.startsWith('folder:') ? activeKey.slice(7) : null;
  const rows = useMemo(() => sidebarRows(model, draggingFolder), [model, draggingFolder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes }),
  );

  const onDragStart = ({ active }: DragStartEvent) => setActiveKey(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null);
    justDropped.current = true;
    setTimeout(() => (justDropped.current = false), 0);
    if (!over) return;
    const drop = resolveSidebarDrop(rows, String(active.id), String(over.id));
    if (drop?.kind === 'list') moveList(drop.id, drop.folderId, drop.index);
    else if (drop?.kind === 'folder') moveFolder(drop.id, drop.index);
  };
  // Clicks that end a drag shouldn't also open the row.
  const click = (fn: () => void) => () => {
    if (!justDropped.current) fn();
  };

  if (!rows.length) {
    return <p className="px-2 py-1 text-[13px] text-fg-subtle">No lists yet</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveKey(null)}
    >
      <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
        {rows.map((row) => (
          <Sortable key={row.key} row={row}>
            {({ ref, style, dragging, handle }) => {
              if (row.kind === 'folder') {
                const { folder } = row;
                const isRenaming = renaming?.kind === 'folder' && renaming.id === folder.id;
                const Icon =
                  folder.collapsed || draggingFolder === folder.id ? FolderIcon : FolderOpen;
                const entries = () =>
                  folderMenuEntries(folder, {
                    onRename: () => startRename({ kind: 'folder', id: folder.id }),
                  });
                return (
                  <div ref={ref} style={style} className="group/folder">
                    <ContextMenu entries={entries}>
                      <SidebarItem
                        {...handle}
                        aria-expanded={!folder.collapsed}
                        className={clsx(
                          'group-focus-within/folder:pr-8 group-hover/folder:pr-8',
                          dragging && 'bg-elevated shadow-popover',
                        )}
                        onClick={click(() => setFolderCollapsed(folder.id, !folder.collapsed))}
                        icon={
                          <>
                            <ChevronRight
                              aria-hidden
                              className={clsx(
                                '-mx-1 size-3.5 shrink-0 text-fg-subtle transition-transform',
                                !folder.collapsed && 'rotate-90',
                              )}
                            />
                            <Icon
                              aria-hidden
                              className={clsx('size-4 shrink-0', !folder.color && 'text-fg-muted')}
                              style={{ color: colorVar(folder.color) }}
                            />
                          </>
                        }
                        label={folder.name}
                        count={folder.collapsed ? row.listCount : null}
                        editor={
                          isRenaming ? (
                            <RenameField
                              initial={folder.name}
                              label="Folder name"
                              onCommit={(name) => renameFolder(folder.id, name)}
                              onDone={stopRename}
                            />
                          ) : undefined
                        }
                      />
                    </ContextMenu>
                    {!isRenaming && !dragging && (
                      <Menu
                        align="start"
                        entries={entries}
                        trigger={
                          <IconButton
                            size="sm"
                            label={`${folder.name} actions`}
                            tooltip={false}
                            icon={<Ellipsis className="size-3.5" />}
                            className="absolute top-0.5 right-0.5 opacity-0 group-focus-within/folder:opacity-100 group-hover/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          />
                        }
                      />
                    )}
                  </div>
                );
              }
              const { list } = row;
              const isRenaming =
                renaming?.kind === 'list' && renaming.id === list.id && !renaming.pinned;
              return (
                <ContextMenu
                  entries={() =>
                    listMenuEntries(list, {
                      onRename: () => startRename({ kind: 'list', id: list.id }),
                    })
                  }
                >
                  <SidebarItem
                    ref={ref}
                    style={style}
                    {...handle}
                    nested={!!row.folderId}
                    active={view.kind === 'list' && view.listId === list.id}
                    className={clsx(dragging && 'bg-elevated shadow-popover')}
                    onClick={click(() => openList(list.id))}
                    onDoubleClick={() => startRename({ kind: 'list', id: list.id })}
                    icon={<ListIcon type={list.type} color={list.color} />}
                    label={list.title}
                    count={counts.get(list.id)}
                    editor={
                      isRenaming ? (
                        <RenameField
                          initial={list.title}
                          label="List name"
                          onCommit={(title) => renameList(list.id, title)}
                          onDone={stopRename}
                        />
                      ) : undefined
                    }
                  />
                </ContextMenu>
              );
            }}
          </Sortable>
        ))}
      </SortableContext>
    </DndContext>
  );
}
