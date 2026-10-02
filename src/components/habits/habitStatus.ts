import type { CheckIn, HabitGoal } from '@/data/types';
import type { DateKey } from '@/lib/dates';
import {
  checkedDays,
  currentStreak,
  DEFAULT_HABIT_GOAL,
  goalLabel,
  streakLabel,
  weekCount,
} from '@/store/habits';

export interface HabitStatus {
  goal: HabitGoal;
  days: Set<DateKey>;
  /** Check-ins this week, for a weekly goal. */
  weekCount: number;
  streak: number;
}

/** "2 of 3 this week" for a weekly goal, "Every day" for a daily one. */
export function progressText(status: HabitStatus): string {
  const { goal } = status;
  return goal.period === 'day' ? goalLabel(goal) : `${status.weekCount} of ${goal.times} this week`;
}

/** What a screen reader hears after the name: "Every day. 5 day streak. Done today." */
export function describeHabit(status: HabitStatus, today: DateKey): string {
  const { goal } = status;
  const parts = [
    goal.period === 'day' ? goalLabel(goal) : `${goalLabel(goal)}. ${progressText(status)}`,
    streakLabel(goal, status.streak),
    status.days.has(today) ? 'Done today' : 'Not done today',
  ];
  return `${parts.join('. ')}.`;
}

/** Where a habit stands today: its days, this week's count and its streak. */
export function habitStatus(
  goal: HabitGoal | null,
  checkIns: Iterable<CheckIn>,
  itemId: string,
  today: DateKey,
  weekStartsOn: 0 | 1,
): HabitStatus {
  const g = goal ?? DEFAULT_HABIT_GOAL;
  const days = checkedDays(checkIns, itemId);
  return {
    goal: g,
    days,
    weekCount: weekCount(days, today, weekStartsOn),
    streak: currentStreak(g, days, today, weekStartsOn),
  };
}
