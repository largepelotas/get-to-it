import clsx from 'clsx';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { LIST_TYPE_ICON } from '@/components/listTypeIcons';
import { QuickAdd } from '@/components/items/QuickAdd';
import { focusQuickAdd } from '@/hooks/useAppShortcuts';
import { Button, Dialog, Input, Label, Select } from '@/components/ui';
import type { ListType } from '@/data/types';
import { todayKey } from '@/lib/dates';
import { bySortKey } from '@/lib/order';
import { createList, LIST_TYPE_LABEL } from '@/store/actions/lists';
import { useData } from '@/store/data';
import { liveTodoLists } from '@/store/sidebar';
import { closeDialog, openList, useUI, type DialogState } from '@/store/ui';
import {
  CommandPalette,
  MoveTasksDialog,
  preloadDialogs,
  SettingsDialog,
  ShortcutsDialog,
} from './lazy';

const TYPES: ListType[] = ['todo', 'grocery', 'note'];

const PLACEHOLDER: Record<ListType, string> = {
  todo: 'e.g. This week',
  grocery: 'e.g. Weekly shop',
  note: 'e.g. Meeting notes',
};

function NewListDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'newList' }> }) {
  const [type, setType] = useState<ListType>(dialog.type ?? 'todo');
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(dialog.folderId ?? '');
  const allFolders = useData((s) => s.tables.folders);
  const folders = useMemo(
    () =>
      Object.values(allFolders)
        .filter((f) => !f.deletedAt)
        .sort(bySortKey),
    [allFolders],
  );

  const submit = () => {
    const id = createList({ type, title, folderId: folderId || null });
    closeDialog();
    openList(id);
    // Straight on to the first task or item, once the dialog has handed focus back.
    setTimeout(focusQuickAdd, 0);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title="New list"
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-list-form">
            Create
          </Button>
        </>
      }
    >
      <form
        id="new-list-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div role="radiogroup" aria-label="List type" className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = LIST_TYPE_ICON[t];
            const selected = t === type;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setType(t)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[13px] transition-colors',
                  selected
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-line-strong text-fg-muted hover:bg-hover',
                )}
              >
                <Icon className={clsx('size-5', selected && 'text-accent')} />
                {LIST_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
        <div>
          <Label htmlFor="new-list-title">Name</Label>
          <Input
            id="new-list-title"
            autoFocus
            value={title}
            placeholder={PLACEHOLDER[type]}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="new-list-folder">Folder</Label>
          <Select
            id="new-list-folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Dialog>
  );
}

/** The list the quick-add dialog starts on: the open list, else the default list, else the Inbox. */
function startingList(todo: { id: string; title: string }[]): string {
  const { view } = useUI.getState();
  const has = (id: string | null | undefined) => !!id && todo.some((l) => l.id === id);
  if (view.kind === 'list' && has(view.listId)) return view.listId;
  const { defaultListId } = useData.getState().settings;
  if (has(defaultListId)) return defaultListId!;
  return (todo.find((l) => l.title === 'Inbox') ?? todo[0])?.id ?? '';
}

/** "Add a task to…": the quick-add field plus a choice of list, from any screen. */
function QuickAddDialog() {
  const allLists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  const todo = useMemo(() => liveTodoLists({ lists: allLists, folders }), [allLists, folders]);
  const [listId, setListId] = useState(() => startingList(todo));
  // Today's own quick add gives new tasks today's date, so this does too.
  const [defaultDue] = useState(() => (useUI.getState().view.kind === 'today' ? todayKey() : null));
  // Whether the dialog's own field has its paste bar up (not one in the view behind).
  const [pasteBar, setPasteBar] = useState(false);
  const chosen = todo.some((l) => l.id === listId) ? listId : startingList(todo);

  return (
    <Dialog
      open
      // While the paste bar is up, Escape only dismisses the bar.
      onOpenChange={(open) => {
        if (!open && !pasteBar) closeDialog();
      }}
      title="Add a task"
      description={chosen ? undefined : 'Create a to-do list first, then add tasks to it.'}
      footer={<Button onClick={closeDialog}>Cancel</Button>}
    >
      {chosen && (
        <div className="space-y-3">
          <QuickAdd
            inDialog
            listId={chosen}
            defaultDue={defaultDue}
            announce
            onPasteBarChange={setPasteBar}
            onAdded={closeDialog}
            placeholder="e.g. Call Sam tomorrow 3pm #Work"
          />
          <div>
            <Label htmlFor="quick-add-list">List</Label>
            <Select id="quick-add-list" value={chosen} onChange={(e) => setListId(e.target.value)}>
              {todo.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ConfirmDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'confirm' }> }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={dialog.title}
      description={dialog.message}
      footer={
        <>
          <Button autoFocus onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant={dialog.danger ? 'danger' : 'primary'}
            onClick={() => {
              closeDialog();
              dialog.onConfirm();
            }}
          >
            {dialog.confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/** Renders whichever app dialog is open. */
export function Dialogs() {
  const dialog = useUI((s) => s.dialog);
  useEffect(() => {
    const timer = setTimeout(() => void preloadDialogs(), 1500);
    return () => clearTimeout(timer);
  }, []);
  if (!dialog) return null;
  if (dialog.kind === 'newList') return <NewListDialog dialog={dialog} />;
  if (dialog.kind === 'quickAdd') return <QuickAddDialog />;
  if (dialog.kind === 'confirm') return <ConfirmDialog dialog={dialog} />;
  return (
    <Suspense fallback={null}>
      {dialog.kind === 'settings' ? (
        <SettingsDialog />
      ) : dialog.kind === 'shortcuts' ? (
        <ShortcutsDialog />
      ) : dialog.kind === 'moveTasks' ? (
        <MoveTasksDialog />
      ) : (
        <CommandPalette />
      )}
    </Suspense>
  );
}
