import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { LIST_TYPE_ICON } from '@/components/listTypeIcons';
import { Button, Dialog, Input, Label, Select } from '@/components/ui';
import type { ListType } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { createList, LIST_TYPE_LABEL } from '@/store/actions/lists';
import { useData } from '@/store/data';
import { closeDialog, openList, useUI, type DialogState } from '@/store/ui';

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
  if (!dialog) return null;
  if (dialog.kind === 'newList') return <NewListDialog dialog={dialog} />;
  return <ConfirmDialog dialog={dialog} />;
}
