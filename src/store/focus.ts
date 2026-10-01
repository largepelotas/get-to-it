import { create } from 'zustand';
import type { FocusSession } from '@/data/types';
import {
  elapsedMs,
  isFinished,
  MIN_LOGGED_SECONDS,
  type FocusTimer,
  type TimerKind,
} from '@/lib/focus';
import { newId } from '@/lib/id';
import { commit, useData } from './data';

/** The running timer, if any. Not stored: only finished sessions are. */
export const useFocus = create<{ timer: FocusTimer | null }>(() => ({ timer: null }));

/** What stopping or finishing a timer produced, for toasts. */
export interface FocusResult {
  timer: FocusTimer;
  /** The logged session, or null when nothing was logged (a break, under a minute, task gone). */
  session: FocusSession | null;
}

/** Ends the timer and logs `seconds` on its task, if that is worth logging. */
function end(timer: FocusTimer, seconds: number, now: number): FocusResult {
  useFocus.setState({ timer: null });
  let session: FocusSession | null = null;
  if (
    timer.kind !== 'break' &&
    timer.itemId &&
    seconds >= MIN_LOGGED_SECONDS &&
    useData.getState().tables.items[timer.itemId]
  ) {
    const row: FocusSession = {
      id: timer.id,
      itemId: timer.itemId,
      kind: timer.kind,
      startedAt: timer.startedAt,
      endedAt: now,
      seconds,
    };
    // Bookkeeping, like a reminder firing: not an undo step.
    commit('Log focus', (tx) => tx.put('focusSessions', row), { undoable: false });
    session = row;
  }
  return { timer, session };
}

/**
 * Starts a timer, stopping (and logging) the running one first. A Pomodoro or
 * stopwatch needs a live, unchecked, undeleted task; otherwise nothing happens
 * and it returns false. `minutes` is the countdown length (null for a stopwatch).
 */
export function startTimer(
  kind: TimerKind,
  itemId: string | null,
  minutes: number | null,
  now = Date.now(),
): boolean {
  if (kind !== 'break') {
    const item = itemId ? useData.getState().tables.items[itemId] : undefined;
    if (!item || item.deletedAt || item.checked) return false;
  }
  stopTimer(now);
  useFocus.setState({
    timer: {
      id: newId(),
      kind,
      itemId: kind === 'break' ? null : itemId,
      startedAt: now,
      minutes: kind === 'stopwatch' ? null : minutes,
      pausedAt: null,
      pausedMs: 0,
    },
  });
  return true;
}

export function pauseTimer(now = Date.now()): void {
  const { timer } = useFocus.getState();
  if (!timer || timer.pausedAt !== null) return;
  useFocus.setState({ timer: { ...timer, pausedAt: now } });
}

export function resumeTimer(now = Date.now()): void {
  const { timer } = useFocus.getState();
  if (!timer || timer.pausedAt === null) return;
  useFocus.setState({
    timer: {
      ...timer,
      pausedAt: null,
      pausedMs: timer.pausedMs + Math.max(0, now - timer.pausedAt),
    },
  });
}

/** Stops the timer and logs it. Returns null when no timer was running. */
export function stopTimer(now = Date.now()): FocusResult | null {
  const { timer } = useFocus.getState();
  if (!timer) return null;
  return end(timer, Math.round(elapsedMs(timer, now) / 1000), now);
}

/** Ends a countdown that has reached zero (no-op, null, if the timer is not finished). Logs the planned length. */
export function finishTimer(now = Date.now()): FocusResult | null {
  const { timer } = useFocus.getState();
  if (!timer || !isFinished(timer, now)) return null;
  return end(timer, (timer.minutes ?? 0) * 60, now);
}

/** Stops the timer if it is on one of these tasks (used when they are completed or deleted). */
export function stopTimerForItems(ids: string[], now = Date.now()): FocusResult | null {
  const { timer } = useFocus.getState();
  if (!timer?.itemId || !ids.includes(timer.itemId)) return null;
  return stopTimer(now);
}

/** A task's logged sessions, newest first. */
export function itemSessions(
  sessions: Record<string, FocusSession>,
  itemId: string,
): FocusSession[] {
  return Object.values(sessions)
    .filter((s) => s.itemId === itemId)
    .sort((a, b) => b.endedAt - a.endedAt);
}

/** Total seconds logged on a task. */
export function focusSeconds(sessions: Record<string, FocusSession>, itemId: string): number {
  let total = 0;
  for (const s of Object.values(sessions)) if (s.itemId === itemId) total += s.seconds;
  return total;
}
