import { describe, expect, it } from 'vitest';
import type { FocusSession } from '@/data/types';
import type { CompletedEntry, CompletedKind } from './completed';
import { doneByDay, focusByDay, heatLevel, heatmapWeeks, lastDays, summary } from './stats';

let n = 0;
const entry = (day: string, kind: CompletedKind = 'done'): CompletedEntry => ({
  key: `e${n++}`,
  itemId: 'i',
  text: 't',
  listId: 'l',
  completedAt: 0,
  day,
  kind,
});

const session = (startedAt: number, seconds: number): FocusSession => ({
  id: `s${startedAt}`,
  itemId: 'i',
  kind: 'stopwatch',
  startedAt,
  endedAt: startedAt + seconds * 1000,
  seconds,
});

describe('doneByDay', () => {
  // Bug prevented: won't-do tasks inflating the done count.
  it("counts done and repeat entries but not won't-do", () => {
    const m = doneByDay([
      entry('2026-10-01'),
      entry('2026-10-01', 'repeat'),
      entry('2026-10-01', 'wontDo'),
      entry('2026-09-30', 'wontDo'),
    ]);
    expect([...m]).toEqual([['2026-10-01', 2]]);
  });

  it('is empty for no entries', () => {
    expect(doneByDay([]).size).toBe(0);
  });
});

describe('focusByDay', () => {
  // Bug prevented: sessions grouped by UTC day, or one split across midnight.
  it('sums seconds by the local day the session started', () => {
    const m = focusByDay([
      session(new Date(2026, 9, 1, 23, 50).getTime(), 1800),
      session(new Date(2026, 9, 1, 9, 0).getTime(), 600),
      session(new Date(2026, 9, 2, 0, 5).getTime(), 60),
    ]);
    expect([...m].sort()).toEqual([
      ['2026-10-01', 2400],
      ['2026-10-02', 60],
    ]);
  });

  it('is empty for no sessions', () => {
    expect(focusByDay([]).size).toBe(0);
  });
});

describe('lastDays', () => {
  // Bug prevented: off-by-one so today is missing or the list is newest first.
  it('runs oldest first and ends today, across a month boundary', () => {
    expect(lastDays('2026-10-02', 4)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('gives nothing for zero', () => {
    expect(lastDays('2026-10-02', 0)).toEqual([]);
  });
});

describe('summary', () => {
  // 2026-10-01 is a Thursday.
  const done = new Map([
    ['2026-10-01', 2], // today
    ['2026-09-29', 3], // Tuesday of this week
    ['2026-09-28', 1], // Monday of this week
    ['2026-09-27', 4], // Sunday, last week for a Monday start
  ]);
  const focus = new Map([
    ['2026-10-01', 600],
    ['2026-09-27', 60],
  ]);

  // Bug prevented: a Monday-start week including Sunday, or all-time missing older days.
  it('works out today, this week (Monday start) and all time', () => {
    expect(summary(done, focus, '2026-10-01')).toEqual({
      doneToday: 2,
      doneThisWeek: 6,
      doneTotal: 10,
      focusToday: 600,
      focusThisWeek: 600,
      focusTotal: 660,
    });
  });

  // Bug prevented: the week start ignoring the Sunday setting.
  it('starts the week on Sunday when asked', () => {
    const s = summary(done, focus, '2026-10-01', 0);
    expect(s.doneThisWeek).toBe(10);
    expect(s.focusThisWeek).toBe(660);
  });

  // Bug prevented: the first day of the week being left out of "this week", or the day before let in.
  it('includes the first day of the week and excludes the day before', () => {
    expect(summary(new Map([['2026-09-28', 1]]), new Map(), '2026-10-01').doneThisWeek).toBe(1);
    expect(summary(new Map([['2026-09-27', 1]]), new Map(), '2026-10-01').doneThisWeek).toBe(0);
  });

  it('is all zero for no data', () => {
    expect(summary(new Map(), new Map(), '2026-10-01')).toEqual({
      doneToday: 0,
      doneThisWeek: 0,
      doneTotal: 0,
      focusToday: 0,
      focusThisWeek: 0,
      focusTotal: 0,
    });
  });
});

describe('heatmapWeeks', () => {
  // Bug prevented: wrong shape, so the grid is ragged or the future shows as days.
  it('has 53 columns of 7, ending with the week that holds today; later days are null', () => {
    const weeks = heatmapWeeks('2026-10-01'); // Thursday
    expect(weeks).toHaveLength(53);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[52]).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      null,
      null,
      null,
    ]);
    expect(weeks[0][0]).toBe('2025-09-29');
    expect(weeks[51][6]).toBe('2026-09-27');
  });

  // Bug prevented: the year boundary dropping or repeating days.
  it('runs without gaps across a year boundary', () => {
    const days = heatmapWeeks('2026-01-02').flat();
    const real = days.filter((d): d is string => d !== null);
    expect(real).toContain('2025-12-31');
    expect(real).toContain('2026-01-01');
    expect(new Set(real).size).toBe(real.length);
    expect(real[real.length - 1]).toBe('2026-01-02');
    expect(real).toHaveLength(52 * 7 + 5); // 52 whole weeks, then Mon to Fri
  });

  // Bug prevented: Sunday-start users getting Monday-start columns.
  it('starts columns on Sunday when asked', () => {
    expect(heatmapWeeks('2026-10-01', 0)[52][0]).toBe('2026-09-27');
  });

  // Bug prevented: today being null when it is the first day of its week.
  it('keeps today when it starts the week', () => {
    expect(heatmapWeeks('2026-09-28')[52]).toEqual([
      '2026-09-28',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('heatLevel', () => {
  // Bug prevented: a small non-zero day looking the same as an empty one.
  it('is 0 only for 0 and at least 1 for anything else', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(1, 1000)).toBe(1);
  });

  // Bug prevented: bands in the wrong place, or the busiest day not hitting the top shade.
  it('uses quarters of the maximum', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((v) => heatLevel(v, 8))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(heatLevel(10, 10)).toBe(4);
  });
});
