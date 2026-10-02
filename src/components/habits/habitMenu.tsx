import { ArrowDown, ArrowUp, CircleCheck, CircleX, Pencil, Target, Trash } from 'lucide-react';
import type { MenuEntries, MenuEntry } from '@/components/ui';
import type { HabitGoal, Item } from '@/data/types';
import { setHabitGoal } from '@/store/actions/habits';
import { goalLabel, sameGoal } from '@/store/habits';

const icon = 'size-3.5';

/** Every goal a habit can have: each day, or 1 to 7 times a week. */
export const GOALS: HabitGoal[] = [
  { period: 'day' },
  ...[1, 2, 3, 4, 5, 6, 7].map((times): HabitGoal => ({ period: 'week', times })),
];

/** The goals as menu choices, with the current one checked. */
export function goalEntries(item: Item): MenuEntries {
  return GOALS.map((goal): MenuEntry => ({
    label: goalLabel(goal),
    checked: !!item.habit && sameGoal(item.habit, goal),
    onSelect: () => setHabitGoal(item.id, goal),
  }));
}

export interface HabitMenuActions {
  checkedToday: boolean;
  toggleToday: () => void;
  rename: () => void;
  moveUp: () => void;
  moveDown: () => void;
  remove: () => void;
}

/** The right-click menu of a habit. */
export function habitMenuEntries(item: Item, actions: HabitMenuActions): MenuEntries {
  return [
    {
      label: actions.checkedToday ? 'Undo check-in' : 'Check in',
      icon: actions.checkedToday ? <CircleX className={icon} /> : <CircleCheck className={icon} />,
      onSelect: actions.toggleToday,
    },
    { kind: 'sub', label: 'Goal', icon: <Target className={icon} />, entries: goalEntries(item) },
    {
      label: 'Rename',
      icon: <Pencil className={icon} />,
      movesFocus: true,
      onSelect: actions.rename,
    },
    { kind: 'separator' },
    {
      label: 'Move up',
      icon: <ArrowUp className={icon} />,
      shortcut: 'Alt+ArrowUp',
      onSelect: actions.moveUp,
    },
    {
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
