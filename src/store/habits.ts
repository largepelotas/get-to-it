import type { CheckIn, HabitGoal } from '@/data/types';
import { addDaysKey, daysBetween, startOfWeekKey, type DateKey } from '@/lib/dates';

/* Habits: streaks and progress, worked out from a habit's check-in days. No React. */

export const DEFAULT_HABIT_GOAL: HabitGoal = { period: 'day' };

/** Cleans a goal read from storage or a file: anything unreadable is the default, every day. */
export function sanitizeHabitGoal(value: unknown): HabitGoal {
  if (!value || typeof value !== 'object') return { period: 'day' };
  const v = value as { period?: unknown; times?: unknown };
  if (v.period === 'week') {
    const times = typeof v.times === 'number' && Number.isFinite(v.times) ? Math.round(v.times) : 1;
    return { period: 'week', times: Math.min(7, Math.max(1, times)) };
  }
  return { period: 'day' };
}

/** The days one habit was checked in. */
export function checkedDays(checkIns: Iterable<CheckIn>, itemId: string): Set<DateKey> {
  const out = new Set<DateKey>();
  for (const c of checkIns) if (c.itemId === itemId) out.add(c.day);
  return out;
}

/** Check-ins in the week that holds `today`. */
export function weekCount(days: Set<DateKey>, today: DateKey, weekStartsOn: 0 | 1): number {
  const start = startOfWeekKey(today, weekStartsOn);
  const end = addDaysKey(start, 6);
  let n = 0;
  for (const d of days) if (d >= start && d <= end) n++;
  return n;
}

/** Still to do today: today isn't checked and, for a weekly goal, this week is short of it. */
export function isDue(
  goal: HabitGoal,
  days: Set<DateKey>,
  today: DateKey,
  weekStartsOn: 0 | 1 = 1,
): boolean {
  if (days.has(today)) return false;
  if (goal.period === 'day') return true;
  return weekCount(days, today, weekStartsOn) < goal.times;
}

/** Number of check-ins in each week, by the day the week starts. Days after `until` are left out. */
function weekCounts(
  days: Set<DateKey>,
  weekStartsOn: 0 | 1,
  until?: DateKey,
): Map<DateKey, number> {
  const out = new Map<DateKey, number>();
  for (const d of days) {
    if (until && d > until) continue;
    const w = startOfWeekKey(d, weekStartsOn);
    out.set(w, (out.get(w) ?? 0) + 1);
  }
  return out;
}

/** Length of the longest run of consecutive steps (`step` days apart) in a sorted list of keys. */
function longestRun(sorted: DateKey[], step: number): number {
  let best = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const key of sorted) {
    run = prev !== null && daysBetween(prev, key) === step ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

/**
 * The streak now. Daily: consecutive checked days ending today, or yesterday while today
 * isn't done yet. Weekly: consecutive weeks that reached the goal, counting back from this
 * week if it has, otherwise from last week.
 */
export function currentStreak(
  goal: HabitGoal,
  days: Set<DateKey>,
  today: DateKey,
  weekStartsOn: 0 | 1 = 1,
): number {
  if (goal.period === 'day') {
    let day = days.has(today) ? today : addDaysKey(today, -1);
    let n = 0;
    while (days.has(day)) {
      n++;
      day = addDaysKey(day, -1);
    }
    return n;
  }
  const counts = weekCounts(days, weekStartsOn, today);
  const met = (w: DateKey) => (counts.get(w) ?? 0) >= goal.times;
  let week = startOfWeekKey(today, weekStartsOn);
  if (!met(week)) week = addDaysKey(week, -7);
  let n = 0;
  while (met(week)) {
    n++;
    week = addDaysKey(week, -7);
  }
  return n;
}

/** The longest streak ever, in days or weeks. */
export function bestStreak(goal: HabitGoal, days: Set<DateKey>, weekStartsOn: 0 | 1 = 1): number {
  if (goal.period === 'day') return longestRun([...days].sort(), 1);
  const weeks = [...weekCounts(days, weekStartsOn)]
    .filter(([, n]) => n >= goal.times)
    .map(([w]) => w)
    .sort();
  return longestRun(weeks, 7);
}

export function streakLabel(goal: HabitGoal, n: number): string {
  if (n <= 0) return 'No streak';
  const unit = goal.period === 'day' ? 'day' : 'week';
  return `${n} ${unit} streak`;
}

export function goalLabel(goal: HabitGoal): string {
  if (goal.period === 'day') return 'Every day';
  if (goal.times === 1) return 'Once a week';
  return `${goal.times} times a week`;
}

/** 1 for each checked day, for the heatmap. */
export function habitDayValues(days: Set<DateKey>): Map<DateKey, number> {
  return new Map([...days].map((d) => [d, 1]));
}

export function sameGoal(a: HabitGoal, b: HabitGoal): boolean {
  return a.period === b.period && (a.period === 'day' || a.times === (b as typeof a).times);
}
