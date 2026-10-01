import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BrushCleaning,
  ClipboardCopy,
  Copy,
  FolderInput,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Trash,
  Undo2,
} from 'lucide-react';
import { COLOR_NAMES, type ColorName, type Folder, type Label, type List } from '@/data/types';
import { SHORTCUTS } from '@/lib/keymap';
import { bySortKey } from '@/lib/order';
import { COLOR_LABEL } from '@/lib/theme';
import {
  archive,
  clearCart,
  copyAsMarkdown,
  deleteForever,
  duplicate,
  removeFolder,
  removeLabel,
  restore,
  trashList,
  unarchive,
  uncheckCart,
} from '@/commands';
import { setFolderColor } from '@/store/actions/folders';
import { moveLabelBy, setLabelColor } from '@/store/actions/labels';
import { moveListToFolder, setListColor, setPinned } from '@/store/actions/lists';
import { useData } from '@/store/data';
import { openDialog } from '@/store/ui';
import { Swatch, type MenuEntries, type MenuEntry } from './ui';

const icon = 'size-3.5';

function colorEntries(current: ColorName | null, set: (c: ColorName | null) => void): MenuEntries {
  return [
    { label: 'None', icon: <Swatch color={null} />, checked: !current, onSelect: () => set(null) },
    { kind: 'separator' },
    ...COLOR_NAMES.map((c): MenuEntry => ({
      label: COLOR_LABEL[c],
      icon: <Swatch color={c} />,
      checked: current === c,
      onSelect: () => set(c),
    })),
  ];
}

const copyEntry = (list: List): MenuEntry => ({
  label: 'Copy as Markdown',
  icon: <ClipboardCopy className={icon} />,
  shortcut: SHORTCUTS.copyMarkdown,
  onSelect: () => void copyAsMarkdown(list.id),
});

export interface ListMenuOptions {
  /** Starts renaming, wherever the menu was opened from. */
  onRename?: () => void;
  /** Adds a section to the list (to-do lists only). */
  onAddSection?: () => void;
}

/** Actions for a list, shown from its context menu and its "…" button. */
export function listMenuEntries(
  list: List,
  { onRename, onAddSection }: ListMenuOptions = {},
): MenuEntries {
  if (list.deletedAt) {
    return [
      {
        label: 'Restore',
        icon: <RotateCcw className={icon} />,
        onSelect: () => restore(list.id),
      },
      { kind: 'separator' },
      {
        label: 'Delete forever…',
        icon: <Trash className={icon} />,
        danger: true,
        onSelect: () => deleteForever(list.id),
      },
    ];
  }
  if (list.archivedAt) {
    return [
      {
        label: 'Unarchive',
        icon: <ArchiveRestore className={icon} />,
        onSelect: () => unarchive(list.id),
      },
      copyEntry(list),
      { kind: 'separator' },
      {
        label: 'Move to Trash',
        icon: <Trash className={icon} />,
        danger: true,
        onSelect: () => trashList(list.id),
      },
    ];
  }

  const { tables } = useData.getState();
  const folders = Object.values(tables.folders)
    .filter((f) => !f.deletedAt)
    .sort(bySortKey);
  const inCart =
    list.type === 'grocery' &&
    Object.values(tables.items).some((i) => i.listId === list.id && i.checked && !i.deletedAt);
  return [
    list.type === 'grocery' && {
      label: 'Uncheck all',
      icon: <Undo2 className={icon} />,
      disabled: !inCart,
      onSelect: () => uncheckCart(list.id),
    },
    list.type === 'grocery' && {
      label: 'Clear checked',
      icon: <BrushCleaning className={icon} />,
      disabled: !inCart,
      onSelect: () => clearCart(list.id),
    },
    { kind: 'separator' },
    onRename && {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      movesFocus: true,
      onSelect: onRename,
    },
    list.type === 'todo' &&
      onAddSection && {
        label: 'Add section',
        icon: <Plus className={icon} />,
        movesFocus: true,
        onSelect: onAddSection,
      },
    {
      label: list.pinned ? 'Unpin' : 'Pin',
      icon: list.pinned ? <PinOff className={icon} /> : <Pin className={icon} />,
      onSelect: () => setPinned(list.id, !list.pinned),
    },
    {
      kind: 'sub',
      label: 'Colour',
      icon: <Palette className={icon} />,
      entries: colorEntries(list.color, (c) => setListColor(list.id, c)),
    },
    {
      kind: 'sub',
      label: 'Move to',
      icon: <FolderInput className={icon} />,
      entries: [
        {
          label: 'No folder',
          checked: !list.folderId,
          disabled: !list.folderId,
          onSelect: () => moveListToFolder(list.id, null),
        },
        folders.length > 0 && { kind: 'separator' },
        ...folders.map((f): MenuEntry => ({
          label: f.name,
          checked: list.folderId === f.id,
          disabled: list.folderId === f.id,
          onSelect: () => moveListToFolder(list.id, f.id),
        })),
      ],
    },
    { label: 'Duplicate', icon: <Copy className={icon} />, onSelect: () => duplicate(list.id) },
    copyEntry(list),
    { kind: 'separator' },
    { label: 'Archive', icon: <Archive className={icon} />, onSelect: () => archive(list.id) },
    {
      label: 'Move to Trash',
      icon: <Trash className={icon} />,
      danger: true,
      onSelect: () => trashList(list.id),
    },
  ];
}

export function folderMenuEntries(folder: Folder, { onRename }: ListMenuOptions = {}): MenuEntries {
  return [
    {
      label: 'New list in folder…',
      icon: <Plus className={icon} />,
      onSelect: () => openDialog({ kind: 'newList', folderId: folder.id }),
    },
    { kind: 'separator' },
    onRename && {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      movesFocus: true,
      onSelect: onRename,
    },
    {
      kind: 'sub',
      label: 'Colour',
      icon: <Palette className={icon} />,
      entries: colorEntries(folder.color, (c) => setFolderColor(folder.id, c)),
    },
    { kind: 'separator' },
    {
      label: 'Delete folder',
      icon: <Trash className={icon} />,
      danger: true,
      onSelect: () => removeFolder(folder.id),
    },
  ];
}

export interface LabelMenuOptions extends ListMenuOptions {
  /** Where the label sits among the others, so Move up / Move down can be disabled at the ends. */
  first: boolean;
  last: boolean;
}

/** Actions for a label, shown from its sidebar row's context menu and "…" button. */
export function labelMenuEntries(
  label: Label,
  { onRename, first, last }: LabelMenuOptions,
): MenuEntries {
  return [
    onRename && {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      movesFocus: true,
      onSelect: onRename,
    },
    {
      kind: 'sub',
      label: 'Colour',
      icon: <Palette className={icon} />,
      entries: colorEntries(label.color, (c) => setLabelColor(label.id, c)),
    },
    {
      label: 'Move up',
      icon: <ArrowUp className={icon} />,
      disabled: first,
      onSelect: () => void moveLabelBy(label.id, -1),
    },
    {
      label: 'Move down',
      icon: <ArrowDown className={icon} />,
      disabled: last,
      onSelect: () => void moveLabelBy(label.id, 1),
    },
    { kind: 'separator' },
    {
      label: 'Delete label',
      icon: <Trash className={icon} />,
      danger: true,
      onSelect: () => removeLabel(label.id),
    },
  ];
}
