import { Archive, Ellipsis, Pin, Trash } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addSection, restore, unarchive } from '@/commands';
import { GroceryList } from '@/components/grocery/GroceryList';
import { HabitDetailsPanel } from '@/components/habits/HabitDetails';
import { HabitList } from '@/components/habits/HabitList';
import { ArrangedTodoList } from '@/components/items/ArrangedTodoList';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { SelectionBar } from '@/components/items/SelectionBar';
import { TodoList } from '@/components/items/TodoList';
import { RichTextField } from '@/components/editor/RichTextField';
import { ListIcon } from '@/components/ListIcon';
import { listMenuEntries } from '@/components/menus';
import { Button, IconButton, Menu } from '@/components/ui';
import type { List } from '@/data/types';
import { renameList } from '@/store/actions/lists';
import { setNoteContent } from '@/store/actions/notes';
import { useData } from '@/store/data';
import type { View } from '@/store/ui';
import { ViewHeader } from './ViewHeader';
import { groupChoices, LIST_SORTS, useViewOptions } from './arrangement';
import { ViewOptionsMenu } from './viewOptions';

function TitleField({
  list,
  inputRef,
}: {
  list: List;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const readOnly = !!(list.deletedAt || list.archivedAt);
  const commit = () => {
    if (draft !== null && draft.trim() !== list.title) renameList(list.id, draft);
    setDraft(null);
  };
  return (
    <input
      ref={inputRef}
      aria-label="List name"
      value={draft ?? list.title}
      readOnly={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          requestAnimationFrame(() => inputRef.current?.blur());
        }
      }}
      className="w-full truncate rounded-md bg-transparent text-2xl font-bold tracking-tight text-fg outline-none placeholder:text-fg-subtle focus:bg-hover"
    />
  );
}

function Banner({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="mx-8 mb-2 flex items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2 text-sm text-fg-muted">
      {icon}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function NoteBody({ list }: { list: List }) {
  const content = useData((s) => s.tables.notes[list.id]?.content ?? null);
  return (
    <RichTextField
      key={list.id}
      variant="note"
      label="Note"
      placeholder="Start writing…"
      content={content}
      readOnly={!!(list.deletedAt || list.archivedAt)}
      onChange={(doc) => setNoteContent(list.id, doc)}
      className="max-w-3xl px-8"
    />
  );
}

function ListBody({ list, view }: { list: List; view: View }) {
  const { sort, group, layout } = useViewOptions(view);
  if (list.type === 'note') return <NoteBody list={list} />;
  if (list.type === 'grocery') return <GroceryList list={list} />;
  if (list.type === 'habit') return <HabitList list={list} />;
  // A list arranged some other way than its own is drawn flat; a stored list keeps its order.
  const arranged =
    (sort !== 'manual' || group !== 'default' || layout === 'board') &&
    !list.deletedAt &&
    !list.archivedAt;
  if (arranged) return <ArrangedTodoList list={list} sort={sort} group={group} layout={layout} />;
  return <TodoList list={list} />;
}

export function ListView({ listId }: { listId: string }) {
  const list = useData((s) => s.tables.lists[listId]);
  const hasSections = useData((s) =>
    Object.values(s.tables.sections).some((section) => section.listId === listId),
  );
  const view = useMemo<View>(() => ({ kind: 'list', listId }), [listId]);
  const titleRef = useRef<HTMLInputElement>(null);
  if (!list) return null;

  const rename = () => {
    titleRef.current?.focus();
    titleRef.current?.select();
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ViewHeader
          icon={<ListIcon type={list.type} color={list.color} className="size-6" />}
          title={
            // The heading's name is the field's value, so the view still has an h1.
            <h1>
              <TitleField key={list.id} list={list} inputRef={titleRef} />
            </h1>
          }
          actions={
            <>
              {list.pinned && <Pin aria-label="Pinned" className="mr-1 size-4 text-fg-subtle" />}
              {list.type === 'todo' && !list.deletedAt && !list.archivedAt && (
                <ViewOptionsMenu
                  view={view}
                  sorts={LIST_SORTS}
                  groups={groupChoices(hasSections ? 'Sections' : null, true)}
                />
              )}
              <Menu
                align="end"
                entries={() =>
                  listMenuEntries(list, {
                    onRename: rename,
                    onAddSection: () => addSection(list.id),
                  })
                }
                trigger={<IconButton label="List actions" icon={<Ellipsis className="size-4" />} />}
              />
            </>
          }
        />
        {list.deletedAt ? (
          <Banner
            icon={<Trash className="size-4" />}
            action={
              <Button size="sm" onClick={() => restore(list.id)}>
                Restore
              </Button>
            }
          >
            This list is in the Trash.
          </Banner>
        ) : list.archivedAt ? (
          <Banner
            icon={<Archive className="size-4" />}
            action={
              <Button size="sm" onClick={() => unarchive(list.id)}>
                Unarchive
              </Button>
            }
          >
            This list is archived.
          </Banner>
        ) : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListBody list={list} view={view} />
          </div>
          {list.type === 'todo' && <SelectionBar />}
        </div>
      </div>
      {list.type === 'todo' && <DetailsPanel listId={list.id} />}
      {list.type === 'habit' && <HabitDetailsPanel listId={list.id} />}
    </div>
  );
}
