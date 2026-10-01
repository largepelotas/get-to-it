import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Ban,
  CalendarDays,
  CalendarSearch,
  CalendarX,
  Copy,
  Flag,
  FolderInput,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  PanelRight,
  SkipForward,
  Sun,
  Sunrise,
  Trash,
} from 'lucide-react';
import { SHORTCUTS } from '@/lib/keymap';
import { ListIcon } from '@/components/ListIcon';
import type { MenuEntries, MenuEntry } from '@/components/ui';
import type { Item } from '@/data/types';
import { addDaysKey, nextWeekKey, todayKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { closeAsWontDo, duplicateTask, moveTaskToList, skipTask } from '@/commands';
import { setDue, setPriority } from '@/store/actions/items';
import { useData } from '@/store/data';
import { liveTodoLists } from '@/store/sidebar';
import { pickDueDate } from '@/store/ui';
import { PRIORITIES, PRIORITY_COLOR } from './priority';

const icon = 'size-3.5';

export interface ItemMenuActions {
  openDetails: () => void;
  /** Absent when the task is already as deep as subtasks go. */
  addSubtask?: () => void;
  /** Tree actions, left out where the list's order isn't shown (Today, Upcoming). */
  indent?: () => void;
  outdent?: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  /** Opens the task's list, for views that gather tasks from many lists. */
  goToList?: () => void;
  remove: () => void;
}

/** Quick due dates, plus the full picker in the details panel. */
function dueEntries(item: Item): MenuEntries {
  const today = todayKey();
  const set = (date: string | null) => () => setDue(item.id, date, item.dueTime);
  return [
    {
      label: 'Today',
      icon: <Sun className={icon} />,
      checked: item.dueDate === today,
      onSelect: set(today),
    },
    {
      label: 'Tomorrow',
      icon: <Sunrise className={icon} />,
      checked: item.dueDate === addDaysKey(today, 1),
      onSelect: set(addDaysKey(today, 1)),
    },
    {
      label: 'Next week',
      icon: <ArrowRight className={icon} />,
      onSelect: set(nextWeekKey(today, useData.getState().settings.weekStartsOn)),
    },
    {
      label: 'Pick a date…',
      icon: <CalendarSearch className={icon} />,
      shortcut: SHORTCUTS.dueDate,
      movesFocus: true,
      onSelect: () => pickDueDate(item.id),
    },
    !item.checked &&
      !!item.recurrence &&
      !!item.dueDate && {
        label: 'Skip this time',
        icon: <SkipForward className={icon} />,
        onSelect: () => skipTask(item.id),
      },
    !!item.dueDate && { kind: 'separator' },
    !!item.dueDate && {
      label: 'No date',
      icon: <CalendarX className={icon} />,
      onSelect: set(null),
    },
  ];
}

/** Every live to-do list, in the order the sidebar shows them. */
function moveToEntries(item: Item): MenuEntries {
  const { lists, folders } = useData.getState().tables;
  return liveTodoLists({ lists, folders }).map((list): MenuEntry => ({
    label: list.title,
    icon: <ListIcon type="todo" color={list.color} className={icon} />,
    checked: item.listId === list.id,
    disabled: item.listId === list.id,
    onSelect: () => moveTaskToList(item.id, list.id),
  }));
}

/** The right-click menu of a task. */
export function itemMenuEntries(item: Item, actions: ItemMenuActions): MenuEntries {
  const inCompleted = item.checked && !item.parentId;
  return [
    {
      label: 'Open details',
      icon: <PanelRight className={icon} />,
      shortcut: SHORTCUTS.details,
      onSelect: actions.openDetails,
    },
    actions.addSubtask && {
      label: 'Add subtask',
      icon: <ListPlus className={icon} />,
      movesFocus: true,
      onSelect: actions.addSubtask,
    },
    {
      label: 'Duplicate',
      icon: <Copy className={icon} />,
      movesFocus: true,
      onSelect: () => duplicateTask(item.id),
    },
    {
      kind: 'sub',
      label: 'Due date',
      icon: <CalendarDays className={icon} />,
      entries: dueEntries(item),
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
    {
      kind: 'sub',
      label: 'Move to',
      icon: <FolderInput className={icon} />,
      entries: moveToEntries(item),
    },
    !item.checked &&
      !item.recurrence && {
        label: "Won't do",
        icon: <Ban className={icon} />,
        onSelect: () => closeAsWontDo(item.id),
      },
    actions.goToList && {
      label: 'Go to list',
      icon: <ArrowRight className={icon} />,
      onSelect: actions.goToList,
    },
    { kind: 'separator' },
    !inCompleted &&
      actions.indent && {
        label: 'Indent',
        icon: <IndentIncrease className={icon} />,
        shortcut: 'Tab',
        onSelect: actions.indent,
      },
    !!item.parentId &&
      actions.outdent && {
        label: 'Outdent',
        icon: <IndentDecrease className={icon} />,
        shortcut: 'Shift+Tab',
        onSelect: actions.outdent,
      },
    !inCompleted &&
      actions.moveUp && {
        label: 'Move up',
        icon: <ArrowUp className={icon} />,
        shortcut: 'Alt+ArrowUp',
        onSelect: actions.moveUp,
      },
    !inCompleted &&
      actions.moveDown && {
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
