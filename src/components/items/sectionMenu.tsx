import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react';
import type { MenuEntries } from '@/components/ui';

const icon = 'size-3.5';

/** What the heading's menu and buttons can do. */
export interface SectionActions {
  addTask: () => void;
  rename: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  remove: () => void;
}

/** The menu of a section heading, shown from its "…" button and its right-click. */
export function sectionMenuEntries(actions: SectionActions): MenuEntries {
  return [
    {
      label: 'Add task',
      icon: <Plus className={icon} />,
      movesFocus: true,
      onSelect: actions.addTask,
    },
    {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      shortcut: 'F2',
      movesFocus: true,
      onSelect: actions.rename,
    },
    { kind: 'separator' },
    actions.moveUp && {
      label: 'Move up',
      icon: <ArrowUp className={icon} />,
      shortcut: 'Alt+ArrowUp',
      onSelect: actions.moveUp,
    },
    actions.moveDown && {
      label: 'Move down',
      icon: <ArrowDown className={icon} />,
      shortcut: 'Alt+ArrowDown',
      onSelect: actions.moveDown,
    },
    { kind: 'separator' },
    {
      label: 'Delete section',
      icon: <Trash className={icon} />,
      danger: true,
      onSelect: actions.remove,
    },
  ];
}
