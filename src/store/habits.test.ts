import { describe, expect, it } from 'vitest';
import type { CheckIn, HabitGoal } from '@/data/types';
import { addDaysKey, type DateKey } from '@/lib/dates';
import {
  bestStreak,
  checkedDays,
  currentStreak,
  goalLabel,
  habitDayValues,
  isDue,
  sanitizeHabitGoal,
  streakLabel,
  weekCount,
} from './habits';

const DAY: HabitGoal = { period: 'day' };
const week = (times: number): HabitGoal => ({ period: 'week', times });
const set = (...days: DateKey[]) => new Set(days);
/** `n` consecutive days ending at `end`. */
const run = (end: DateKey, n: number) =>
  set(...Array.from({ length: n }, (_, i) => addDaysKey(end, -i)));

// 2026-10-01 is a Thursday. Its week starts 2026-09-28 (Monday) or 2026-09-27 (Sunday).
const THU = '2026-10-01';

describe('checkedDays', () => {
  // Bug prevented: one habit's streak counting another habit's check-ins.
  it('keeps only that habit’s days', () => {
    const rows: CheckIn[] = [
      { id: '1', itemId: 'a', day: '2026-10-01', createdAt: 1 },
      { id: '2', itemId: 'b', day: '2026-10-02', createdAt: 1 },
      { id: '3', itemId: 'a', day: '2026-09-30', createdAt: 1 },
    ];
    expect(checkedDays(rows, 'a')).toEqual(set('2026-10-01', '2026-09-30'));
    expect(checkedDays([], 'a').size).toBe(0);
  });
});

describe('weekCount and isDue', () => {
  // Bug prevented: the week boundary ignoring the week-start setting.
  it('counts the week that holds today, by the week start', () => {
    const days = set('2026-09-27', '2026-09-28', '2026-10-01');
    expect(weekCount(days, THU, 1)).toBe(2); // Mon 28 to Sun 4
    expect(weekCount(days, THU, 0)).toBe(3); // Sun 27 to Sat 3
    expect(weekCount(set(), THU, 1)).toBe(0);
  });

  // Bug prevented: a done habit still showing as due, or a met weekly goal still due.
  it('is due until today is checked, and for weekly until the goal is met', () => {
    expect(isDue(DAY, set(), THU)).toBe(true);
    expect(isDue(DAY, set(THU), THU)).toBe(false);
    expect(isDue(DAY, set('2026-09-30'), THU)).toBe(true);
    expect(isDue(week(2), set('2026-09-28'), THU)).toBe(true);
    expect(isDue(week(2), set('2026-09-28', '2026-09-29'), THU)).toBe(false);
    expect(isDue(week(2), set('2026-09-28', THU), THU)).toBe(false);
    expect(isDue(week(2), set('2026-09-27', '2026-09-26'), THU, 1)).toBe(true);
  });
});

describe('currentStreak, daily', () => {
  it('is 0 with no data', () => {
    expect(currentStreak(DAY, set(), THU, 1)).toBe(0);
  });

  // Bug prevented: a streak resetting first thing in the morning before today is ticked.
  it('keeps yesterday’s streak while today is not checked yet', () => {
    expect(currentStreak(DAY, run('2026-09-30', 5), THU, 1)).toBe(5);
    expect(currentStreak(DAY, run(THU, 5), THU, 1)).toBe(5);
  });

  // Bug prevented: a missed day not breaking the streak.
  it('is broken by a gap', () => {
    expect(currentStreak(DAY, set(THU, '2026-09-29', '2026-09-28'), THU, 1)).toBe(1);
    expect(currentStreak(DAY, set('2026-09-29', '2026-09-28'), THU, 1)).toBe(0);
  });

  // Bug prevented: month and year ends breaking a run (naive date arithmetic).
  it('runs across a month and a year boundary', () => {
    expect(currentStreak(DAY, run('2026-03-02', 5), '2026-03-02', 1)).toBe(5);
    expect(currentStreak(DAY, run('2027-01-02', 5), '2027-01-02', 1)).toBe(5);
    expect(bestStreak(DAY, run('2027-01-02', 5), 1)).toBe(5);
  });
});

describe('currentStreak, weekly', () => {
  // Monday-start weeks 09-14 and 09-21 are met with two ticks each.
  const full = ['2026-09-14', '2026-09-15', '2026-09-21', '2026-09-22'] as DateKey[];

  // Bug prevented: a week still in progress breaking the streak.
  it('counts from last week while this week is short of the goal', () => {
    expect(currentStreak(week(2), set(...full, THU), THU, 1)).toBe(2);
  });

  it('counts this week once it has reached the goal', () => {
    expect(currentStreak(week(2), set(...full, '2026-09-28', THU), THU, 1)).toBe(3);
  });

  // Bug prevented: a week below the goal still counting.
  it('is broken by a week below the goal', () => {
    expect(currentStreak(week(2), set('2026-09-14', '2026-09-22'), THU, 1)).toBe(0);
    expect(currentStreak(week(2), set(), THU, 1)).toBe(0);
  });

  // Bug prevented: weeks always starting on Monday whatever the setting says.
  it('follows the week start setting', () => {
    // Sun 20 and Mon 21 Sep: one week with a Sunday start, two weeks with a Monday start.
    const days = set('2026-09-20', '2026-09-21');
    expect(currentStreak(week(2), days, '2026-09-23', 0)).toBe(1);
    expect(currentStreak(week(2), days, '2026-09-23', 1)).toBe(0);
  });

  it('runs across a year boundary', () => {
    // Weeks starting 2026-12-21, 2026-12-28 and 2027-01-04.
    const days = set(
      '2026-12-21',
      '2026-12-22',
      '2026-12-28',
      '2026-12-29',
      '2027-01-04',
      '2027-01-05',
    );
    expect(currentStreak(week(2), days, '2027-01-06', 1)).toBe(3);
  });
});

describe('bestStreak', () => {
  it('is 0 with no data', () => {
    expect(bestStreak(DAY, set(), 1)).toBe(0);
    expect(bestStreak(week(1), set(), 1)).toBe(0);
  });

  // Bug prevented: best streak reporting the current one, or the last run, instead of the longest.
  it('finds the longest run in the past, days', () => {
    const days = new Set([...run('2026-08-10', 7), ...run('2026-09-10', 3), THU]);
    expect(bestStreak(DAY, days, 1)).toBe(7);
  });

  it('finds the longest run, weeks', () => {
    // Two weeks in a row, a gap, then three weeks in a row.
    const days = set(
      '2026-08-03',
      '2026-08-10',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-15', // a second tick in a week does not add a week
    );
    expect(bestStreak(week(1), days, 1)).toBe(3);
    expect(bestStreak(week(2), days, 1)).toBe(1);
  });
});

describe('labels and values', () => {
  it('writes streaks', () => {
    expect(streakLabel(DAY, 5)).toBe('5 day streak');
    expect(streakLabel(DAY, 1)).toBe('1 day streak');
    expect(streakLabel(week(3), 1)).toBe('1 week streak');
    expect(streakLabel(week(3), 4)).toBe('4 week streak');
    expect(streakLabel(DAY, 0)).toBe('No streak');
  });

  it('writes goals', () => {
    expect(goalLabel(DAY)).toBe('Every day');
    expect(goalLabel(week(1))).toBe('Once a week');
    expect(goalLabel(week(3))).toBe('3 times a week');
  });

  it('gives the heatmap one per checked day', () => {
    expect(habitDayValues(set('2026-10-01', '2026-09-30'))).toEqual(
      new Map([
        ['2026-10-01', 1],
        ['2026-09-30', 1],
      ]),
    );
    expect(habitDayValues(set()).size).toBe(0);
  });
});

describe('sanitizeHabitGoal', () => {
  // Bug prevented: a hand-edited file giving a goal of 0 or 99 times a week, never or always met.
  it('keeps a goal valid and defaults the rest to every day', () => {
    expect(sanitizeHabitGoal({ period: 'week', times: 3 })).toEqual(week(3));
    expect(sanitizeHabitGoal({ period: 'week', times: 99 })).toEqual(week(7));
    expect(sanitizeHabitGoal({ period: 'week', times: 0 })).toEqual(week(1));
    expect(sanitizeHabitGoal(null)).toEqual(DAY);
    expect(sanitizeHabitGoal({ period: 'month' })).toEqual(DAY);
  });
});
