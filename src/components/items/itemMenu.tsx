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
  Hourglass,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  Plus,
  PanelRight,
  Rows3,
  SkipForward,
  Sun,
  Sunrise,
  Tag,
  Trash,
} from 'lucide-react';
import { SHORTCUTS } from '@/lib/keymap';
import { ListIcon } from '@/components/ListIcon';
import type { MenuEntries, MenuEntry } from '@/components/ui';
import type { Item } from '@/data/types';
import { addDaysKey, nextWeekKey, todayKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { closeAsWontDo, duplicateTask, moveTaskToList, skipTask } from '@/commands';
import { setDeadline, setDue, setPriority } from '@/store/actions/items';
import { useData } from '@/store/data';
import { liveTodoLists } from '@/store/sidebar';
import { toggleLabelOnItems } from '@/store/actions/labels';
import { sortedLabels } from '@/store/labels';
import { pickDeadline, pickDueDate, pickLabels } from '@/store/ui';
import { LabelDot } from './LabelPicker';
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
  /** The list's sections, for the "Move to section" submenu (absent: no submenu). */
  sections?: { id: string; title: string }[];
  /** The section the task is shown in (null = none), to tick it. */
  currentSectionId?: string | null;
  moveToSection?: (sectionId: string | null) => void;
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

/** Quick deadlines, plus the full chooser in the details panel. */
function deadlineEntries(item: Item): MenuEntries {
  const today = todayKey();
  const nextWeek = nextWeekKey(today, useData.getState().settings.weekStartsOn);
  const set = (date: string | null) => () => setDeadline(item.id, date);
  return [
    {
      label: 'Today',
      icon: <Sun className={icon} />,
      checked: item.deadline === today,
      onSelect: set(today),
    },
    {
      label: 'Tomorrow',
      icon: <Sunrise className={icon} />,
      checked: item.deadline === addDaysKey(today, 1),
      onSelect: set(addDaysKey(today, 1)),
    },
    {
      label: 'Next week',
      icon: <ArrowRight className={icon} />,
      checked: item.deadline === nextWeek,
      onSelect: set(nextWeek),
    },
    {
      label: 'Pick a date…',
      icon: <CalendarSearch className={icon} />,
      movesFocus: true,
      onSelect: () => pickDeadline(item.id),
    },
    !!item.deadline && { kind: 'separator' },
    !!item.deadline && {
      label: 'No deadline',
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

/** "No section" and each section of the list, with the current one ticked. */
function sectionEntries(
  sections: { id: string; title: string }[],
  current: string | null,
  move: (sectionId: string | null) => void,
): MenuEntries {
  return [
    {
      label: 'No section',
      checked: current === null,
      disabled: current === null,
      onSelect: () => move(null),
    },
    { kind: 'separator' },
    ...sections.map((s): MenuEntry => ({
      label: s.title,
      checked: current === s.id,
      disabled: current === s.id,
      onSelect: () => move(s.id),
    })),
  ];
}

/** Every label with a tick on the task's own, then "New label…" (which opens the picker). */
function labelEntries(item: Item): MenuEntries {
  const labels = sortedLabels(useData.getState().tables.labels);
  const has = new Set(item.labelIds ?? []);
  return [
    ...labels.map((l): MenuEntry => ({
      label: l.name,
      icon: <LabelDot color={l.color} />,
      checked: has.has(l.id),
      onSelect: () => toggleLabelOnItems([item.id], l.id),
    })),
    !!labels.length && { kind: 'separator' },
    {
      label: 'New label…',
      icon: <Plus className={icon} />,
      movesFocus: true,
      onSelect: () => pickLabels(item.id),
    },
  ];
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
      label: 'Deadline',
      icon: <Hourglass className={icon} />,
      entries: deadlineEntries(item),
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
      label: 'Labels',
      icon: <Tag className={icon} />,
      entries: labelEntries(item),
    },
    {
      kind: 'sub',
      label: 'Move to',
      icon: <FolderInput className={icon} />,
      entries: moveToEntries(item),
    },
    !!actions.sections?.length &&
      !!actions.moveToSection && {
        kind: 'sub',
        label: 'Move to section',
        icon: <Rows3 className={icon} />,
        entries: sectionEntries(
          actions.sections,
          actions.currentSectionId ?? null,
          actions.moveToSection,
        ),
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
