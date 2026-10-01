import { Command } from 'cmdk';
import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { moveTasksToList } from '@/commands';
import { keepFocus } from '@/components/items/selection';
import { ListIcon } from '@/components/ListIcon';
import { Dialog } from '@/components/ui';
import { withoutDescendants } from '@/store/actions/items';
import { useData } from '@/store/data';
import { liveTodoLists } from '@/store/sidebar';
import { closeDialog, useUI } from '@/store/ui';

/** Keeps the id out of what the filter compares, so typing never matches on it. */
const SEP = '\u0000';

/**
 * "Move to…": a filterable list of the to-do lists. Used by V on a task (or
 * several selected) and by the selection bar. The list the tasks are all in
 * already is shown but can't be chosen.
 */
export function MoveTasksDialog() {
  const dialog = useUI((s) => s.dialog);
  const lists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  const items = useData((s) => s.tables.items);
  const todo = useMemo(() => liveTodoLists({ lists, folders }), [lists, folders]);
  if (dialog?.kind !== 'moveTasks') return null;

  const homes = new Set(dialog.ids.map((id) => items[id]?.listId));
  const current = homes.size === 1 ? [...homes][0] : null;
  // A task selected with its parent moves with it, so count it once (as the toast does).
  const count = withoutDescendants((id) => items[id], dialog.ids).length;

  const choose = (listId: string) => {
    keepFocus(() => {
      closeDialog();
      moveTasksToList(dialog.ids, listId);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={count === 1 ? 'Move task to…' : `Move ${count} tasks to…`}
      description="Type to find a list, then press Enter."
    >
      <Command
        label="Find a list"
        loop
        filter={(value, search) =>
          value.split(SEP)[0].toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
        }
      >
        <Command.Input
          placeholder="Find a list…"
          className="mb-2 h-8 w-full rounded-md border border-line-control bg-surface px-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
        <Command.List className="max-h-64 overflow-y-auto">
          <Command.Empty className="px-2.5 py-3 text-sm text-fg-subtle">
            No lists match.
          </Command.Empty>
          {todo.map((list) => (
            <Command.Item
              key={list.id}
              value={`${list.title}${SEP}${list.id}`}
              disabled={list.id === current}
              onSelect={() => choose(list.id)}
              className="flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg data-[disabled=true]:opacity-50 data-[selected=true]:bg-selected"
            >
              <ListIcon type="todo" color={list.color} />
              <span className="min-w-0 flex-1 truncate">{list.title}</span>
              {list.id === current && (
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  <Check aria-hidden className="size-3.5" />
                  Current list
                </span>
              )}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </Dialog>
  );
}
