import {
  Archive,
  ArchiveRestore,
  Copy,
  FolderInput,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Trash,
} from 'lucide-react';
import { COLOR_NAMES, type ColorName, type Folder, type List } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { COLOR_LABEL } from '@/lib/theme';
import {
  archive,
  deleteForever,
  duplicate,
  removeFolder,
  restore,
  trashList,
  unarchive,
} from '@/commands';
import { setFolderColor } from '@/store/actions/folders';
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

export interface ListMenuOptions {
  /** Starts renaming, wherever the menu was opened from. */
  onRename?: () => void;
}

/** Actions for a list, shown from its context menu and its "…" button. */
export function listMenuEntries(list: List, { onRename }: ListMenuOptions = {}): MenuEntries {
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
      { kind: 'separator' },
      {
        label: 'Move to Trash',
        icon: <Trash className={icon} />,
        danger: true,
        onSelect: () => trashList(list.id),
      },
    ];
  }

  const folders = Object.values(useData.getState().tables.folders)
    .filter((f) => !f.deletedAt)
    .sort(bySortKey);
  return [
    onRename && {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      movesFocus: true,
      onSelect: onRename,
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
