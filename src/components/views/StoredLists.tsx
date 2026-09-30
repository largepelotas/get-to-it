import { Archive, ArchiveRestore, Ellipsis, RotateCcw, Trash } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { confirmEmptyTrash, restore, unarchive } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import { listMenuEntries } from '@/components/menus';
import { Button, ContextMenu, IconButton, Menu } from '@/components/ui';
import type { List } from '@/data/types';
import { useData } from '@/store/data';
import { sidebarModel } from '@/store/sidebar';
import { openList } from '@/store/ui';
import { EmptyState, ViewHeader } from './ViewHeader';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function StoredRow({ list, detail, primary }: { list: List; detail: string; primary: ReactNode }) {
  const folder = useData((s) => (list.folderId ? s.tables.folders[list.folderId] : undefined));
  return (
    <ContextMenu entries={() => listMenuEntries(list)}>
      <li className="group flex items-center gap-3 border-b border-line px-2 py-2 last:border-b-0">
        <button
          type="button"
          onClick={() => openList(list.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-0.5 text-left hover:bg-hover"
        >
          <ListIcon type={list.type} color={list.color} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{list.title}</span>
            <span className="block truncate text-xs text-fg-subtle">
              {folder && !folder.deletedAt ? `${folder.name} · ` : ''}
              {detail}
            </span>
          </span>
        </button>
        {primary}
        <Menu
          align="end"
          entries={() => listMenuEntries(list)}
          trigger={
            <IconButton
              label={`More actions for ${list.title}`}
              icon={<Ellipsis className="size-4" />}
            />
          }
        />
      </li>
    </ContextMenu>
  );
}

function useStored() {
  const lists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  return useMemo(() => sidebarModel({ lists, folders }), [lists, folders]);
}

export function ArchiveView() {
  const { archived } = useStored();
  return (
    <>
      <ViewHeader
        icon={<Archive className="size-6 text-fg-muted" />}
        title="Archive"
        subtitle="Lists you’ve put away. They keep everything and can come back any time."
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        {archived.length ? (
          <ul>
            {archived.map((list) => (
              <StoredRow
                key={list.id}
                list={list}
                detail={`Archived ${dateFormat.format(list.archivedAt!)}`}
                primary={
                  <Button size="sm" variant="ghost" onClick={() => unarchive(list.id)}>
                    <ArchiveRestore className="size-3.5" />
                    Unarchive
                  </Button>
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Archive className="size-8" />} title="No archived lists">
            Archive a list from its menu to hide it from the sidebar without deleting it.
          </EmptyState>
        )}
      </div>
    </>
  );
}

export function TrashView() {
  const { trashed } = useStored();
  return (
    <>
      <ViewHeader
        icon={<Trash className="size-6 text-fg-muted" />}
        title="Trash"
        subtitle="Deleted lists stay here until you empty the Trash."
        actions={
          <Button
            size="sm"
            variant="danger-secondary"
            disabled={!trashed.length}
            onClick={confirmEmptyTrash}
          >
            Empty Trash…
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        {trashed.length ? (
          <ul>
            {trashed.map((list) => (
              <StoredRow
                key={list.id}
                list={list}
                detail={`Deleted ${dateFormat.format(list.deletedAt!)}`}
                primary={
                  <Button size="sm" variant="ghost" onClick={() => restore(list.id)}>
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Trash className="size-8" />} title="The Trash is empty" />
        )}
      </div>
    </>
  );
}
