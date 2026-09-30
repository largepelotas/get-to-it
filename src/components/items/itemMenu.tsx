import {
  ArrowDown,
  ArrowUp,
  Flag,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  PanelRight,
  Trash,
} from 'lucide-react';
import type { MenuEntries } from '@/components/ui';
import type { Item } from '@/data/types';
import { colorVar } from '@/lib/theme';
import { setPriority } from '@/store/actions/items';
import { PRIORITIES, PRIORITY_COLOR } from './priority';

const icon = 'size-3.5';

export interface ItemMenuActions {
  openDetails: () => void;
  /** Absent when the task is already as deep as subtasks go. */
  addSubtask?: () => void;
  indent: () => void;
  outdent: () => void;
  moveUp: () => void;
  moveDown: () => void;
  remove: () => void;
}

/** The right-click menu of a task. */
export function itemMenuEntries(item: Item, actions: ItemMenuActions): MenuEntries {
  const inCompleted = item.checked && !item.parentId;
  return [
    {
      label: 'Open details',
      icon: <PanelRight className={icon} />,
      shortcut: 'Mod+I',
      onSelect: actions.openDetails,
    },
    actions.addSubtask && {
      label: 'Add subtask',
      icon: <ListPlus className={icon} />,
      movesFocus: true,
      onSelect: actions.addSubtask,
    },
    {
      kind: 'sub',
      label: 'Priority',
      icon: <Flag className={icon} />,
      entries: PRIORITIES.map((p) => ({
        label: p ? `P${p}` : 'None',
        icon: p ? (
          <Flag aria-hidden className={icon} style={{ color: colorVar(PRIORITY_COLOR[p]) }} />
        ) : undefined,
        checked: item.priority === p,
        onSelect: () => setPriority(item.id, p),
      })),
    },
    { kind: 'separator' },
    !inCompleted && {
      label: 'Indent',
      icon: <IndentIncrease className={icon} />,
      shortcut: 'Tab',
      onSelect: actions.indent,
    },
    !!item.parentId && {
      label: 'Outdent',
      icon: <IndentDecrease className={icon} />,
      shortcut: 'Shift+Tab',
      onSelect: actions.outdent,
    },
    !inCompleted && {
      label: 'Move up',
      icon: <ArrowUp className={icon} />,
      shortcut: 'Alt+ArrowUp',
      onSelect: actions.moveUp,
    },
    !inCompleted && {
      label: 'Move down',
      icon: <ArrowDown className={icon} />,
      shortcut: 'Alt+ArrowDown',
      onSelect: actions.moveDown,
    },
    { kind: 'separator' },
    {
      label: 'Delete',
      icon: <Trash className={icon} />,
      shortcut: 'Delete',
      danger: true,
      onSelect: actions.remove,
    },
  ];
}
