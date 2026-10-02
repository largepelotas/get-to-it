import type { FocusSession } from '@/data/types';
import { addDaysKey, startOfWeekKey, toDateKey, type DateKey } from '@/lib/dates';
import type { CompletedEntry } from './completed';

/* Statistics: counts per day, worked out from completed entries and focus sessions. */

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Tasks done per day. Won't-do entries are not counted; repeat completions are. */
export function doneByDay(entries: CompletedEntry[]): Map<DateKey, number> {
  const out = new Map<DateKey, number>();
  for (const e of entries) {
    if (e.kind === 'wontDo') continue;
    out.set(e.day, (out.get(e.day) ?? 0) + 1);
  }
  return out;
}

/** Focus seconds per day, by the local day the session started (never split across midnight). */
export function focusByDay(sessions: FocusSession[]): Map<DateKey, number> {
  const out = new Map<DateKey, number>();
  for (const s of sessions) {
    const day = toDateKey(new Date(s.startedAt));
    out.set(day, (out.get(day) ?? 0) + s.seconds);
  }
  return out;
}

/** The last `n` days, oldest first, ending with `today`. */
export function lastDays(today: DateKey, n: number): DateKey[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysKey(today, i - (n - 1)));
}

export interface StatsSummary {
  doneToday: number;
  doneThisWeek: number;
  doneTotal: number;
  focusToday: number;
  focusThisWeek: number;
  focusTotal: number;
}

/** Figures for today, this week (from `weekStartsOn`, Monday by default like the setting) and all time. */
export function summary(
  done: Map<DateKey, number>,
  focus: Map<DateKey, number>,
  today: DateKey,
  weekStartsOn: 0 | 1 = 1,
): StatsSummary {
  const weekStart = startOfWeekKey(today, weekStartsOn);
  const sum = (m: Map<DateKey, number>, from: DateKey | null) => {
    let total = 0;
    for (const [day, n] of m) if (day <= today && (from === null || day >= from)) total += n;
    return total;
  };
  const sumAll = (m: Map<DateKey, number>) => {
    let total = 0;
    for (const n of m.values()) total += n;
    return total;
  };
  return {
    doneToday: sum(done, today),
    doneThisWeek: sum(done, weekStart),
    doneTotal: sumAll(done),
    focusToday: sum(focus, today),
    focusThisWeek: sum(focus, weekStart),
    focusTotal: sumAll(focus),
  };
}

/** 53 columns of 7 days ending with the week that holds `today`. Days after today are null. */
export function heatmapWeeks(today: DateKey, weekStartsOn: 0 | 1 = 1): (DateKey | null)[][] {
  const first = addDaysKey(startOfWeekKey(today, weekStartsOn), -52 * 7);
  return Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDaysKey(first, w * 7 + d);
      return day > today ? null : day;
    }),
  );
}

/** 0 only for 0; otherwise quarters of `max`, so any non-zero value is at least 1. */
export function heatLevel(value: number, max: number): HeatLevel {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatLevel;
}
