import { Archive, Ellipsis, Pin, Trash } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { restore, unarchive } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import { listMenuEntries } from '@/components/menus';
import { RichTextPreview } from '@/components/RichTextPreview';
import { Button, IconButton, Menu } from '@/components/ui';
import type { List } from '@/data/types';
import { isDocEmpty, parseDoc } from '@/lib/richText';
import { renameList } from '@/store/actions/lists';
import { useData } from '@/store/data';
import { EmptyState, ViewHeader } from './ViewHeader';

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

/** Placeholder bodies until the list editors arrive (M2 to-dos, M5 groceries, M6 notes). */
function ListBody({ list }: { list: List }) {
  const note = useData((s) => (list.type === 'note' ? s.tables.notes[list.id] : undefined));
  if (list.type === 'note') {
    const doc = parseDoc(note?.content);
    return doc && !isDocEmpty(doc) ? (
      <div className="max-w-3xl px-8 pb-10">
        <RichTextPreview doc={doc} />
      </div>
    ) : (
      <EmptyState icon={<ListIcon type="note" className="size-8" />} title="This note is empty">
        The note editor is coming soon.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={<ListIcon type={list.type} className="size-8" />}
      title={list.type === 'todo' ? 'No tasks yet' : 'No groceries yet'}
    >
      Adding {list.type === 'todo' ? 'tasks' : 'items'} is coming soon.
    </EmptyState>
  );
}

export function ListView({ listId }: { listId: string }) {
  const list = useData((s) => s.tables.lists[listId]);
  const titleRef = useRef<HTMLInputElement>(null);
  if (!list) return null;

  const rename = () => {
    titleRef.current?.focus();
    titleRef.current?.select();
  };

  return (
    <>
      <ViewHeader
        icon={<ListIcon type={list.type} color={list.color} className="size-6" />}
        title={<TitleField key={list.id} list={list} inputRef={titleRef} />}
        actions={
          <>
            {list.pinned && <Pin aria-label="Pinned" className="mr-1 size-4 text-fg-subtle" />}
            <Menu
              align="end"
              entries={() => listMenuEntries(list, { onRename: rename })}
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ListBody list={list} />
      </div>
    </>
  );
}
