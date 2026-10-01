import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  MAX_BREAK_MINUTES,
  MAX_FOCUS_MINUTES,
  type FocusKind,
} from '@/data/types';
import { formatDuration } from './dates';

export { DEFAULT_BREAK_MINUTES, DEFAULT_FOCUS_MINUTES, MAX_BREAK_MINUTES, MAX_FOCUS_MINUTES };

export type TimerKind = FocusKind | 'break';

/** The timer that is running (or paused) right now. Not stored. */
export interface FocusTimer {
  /** Becomes the session's id when it is logged. */
  id: string;
  kind: TimerKind;
  /** The task, or null for a break. */
  itemId: string | null;
  startedAt: number;
  /** How long a countdown runs; null for a stopwatch. */
  minutes: number | null;
  /** Set while paused. */
  pausedAt: number | null;
  /** Total ms of earlier pauses (not the current one). */
  pausedMs: number;
}

/** A timer stopped before this many seconds is not logged. */
export const MIN_LOGGED_SECONDS = 60;

/** Ms focused so far: the span minus pauses, never negative. */
export function elapsedMs(timer: FocusTimer, now: number): number {
  const until = timer.pausedAt ?? now;
  return Math.max(0, until - timer.startedAt - timer.pausedMs);
}

/** Ms left on a countdown (never negative), or null for a stopwatch. */
export function remainingMs(timer: FocusTimer, now: number): number | null {
  if (timer.minutes === null) return null;
  return Math.max(0, timer.minutes * 60_000 - elapsedMs(timer, now));
}

/** When a countdown reaches zero if it isn't paused again; null while paused or for a stopwatch. */
export function endsAt(timer: FocusTimer): number | null {
  if (timer.minutes === null || timer.pausedAt !== null) return null;
  return timer.startedAt + timer.pausedMs + timer.minutes * 60_000;
}

/** A countdown that has reached zero. */
export function isFinished(timer: FocusTimer, now: number): boolean {
  return remainingMs(timer, now) === 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "24:59", "0:07", "1:02:03" (hours only once there is one). Takes whole seconds. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Whole seconds to show: a countdown rounds up (so it reads 25:00 at the start), a stopwatch rounds down. */
export function clockSeconds(timer: FocusTimer, now: number): number {
  const left = remainingMs(timer, now);
  return left === null ? Math.floor(elapsedMs(timer, now) / 1000) : Math.ceil(left / 1000);
}

/** "45 min", "1 h 15 min" from seconds, at least "1 min". */
export function formatFocusTotal(seconds: number): string {
  return formatDuration(Math.max(1, Math.round(seconds / 60)));
}

/** A whole number of minutes from 1 to `max`, else `fallback`. */
export function cleanMinutes(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
    ? value
    : fallback;
}
