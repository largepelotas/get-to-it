import { describe, expect, it } from 'vitest';
import {
  clockSeconds,
  cleanMinutes,
  elapsedMs,
  endsAt,
  formatClock,
  formatFocusTotal,
  isFinished,
  remainingMs,
  trayStatus,
  type FocusTimer,
} from './focus';

const MIN = 60_000;
const timer = (patch: Partial<FocusTimer> = {}): FocusTimer => ({
  id: 't',
  kind: 'pomodoro',
  itemId: 'i',
  startedAt: 1_000_000,
  minutes: 25,
  pausedAt: null,
  pausedMs: 0,
  ...patch,
});

describe('elapsedMs', () => {
  // Bug prevented: pauses counting as focused time.
  it('counts the span, minus pauses', () => {
    const t = timer();
    expect(elapsedMs(t, t.startedAt + 5 * MIN)).toBe(5 * MIN);
    // Paused at 5 min: the clock stands still however long it stays paused.
    const paused = timer({ pausedAt: t.startedAt + 5 * MIN });
    expect(elapsedMs(paused, t.startedAt + 20 * MIN)).toBe(5 * MIN);
    // Resumed after a 10 minute pause.
    const resumed = timer({ pausedMs: 10 * MIN });
    expect(elapsedMs(resumed, t.startedAt + 20 * MIN)).toBe(10 * MIN);
    expect(elapsedMs(t, t.startedAt - 5)).toBe(0);
  });
});

describe('remainingMs, endsAt, isFinished', () => {
  // Bug prevented: a negative countdown, or a stopwatch reporting a remaining time.
  it('clamps at zero and is null for a stopwatch', () => {
    const t = timer();
    expect(remainingMs(t, t.startedAt + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(t, t.startedAt + 40 * MIN)).toBe(0);
    expect(isFinished(t, t.startedAt + 25 * MIN - 1)).toBe(false);
    expect(isFinished(t, t.startedAt + 25 * MIN)).toBe(true);
    const watch = timer({ kind: 'stopwatch', minutes: null });
    expect(remainingMs(watch, watch.startedAt + MIN)).toBeNull();
    expect(isFinished(watch, watch.startedAt + 999 * MIN)).toBe(false);
    expect(endsAt(watch)).toBeNull();
  });

  // Bug prevented: the end notification firing at the original time after a pause.
  it('moves the end by the pauses and has none while paused', () => {
    const t = timer({ pausedMs: 3 * MIN });
    expect(endsAt(t)).toBe(t.startedAt + 28 * MIN);
    expect(endsAt(timer({ pausedAt: t.startedAt + MIN }))).toBeNull();
  });
});

describe('formatClock', () => {
  it('shows hours only once there is one', () => {
    expect(formatClock(1499)).toBe('24:59');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
  });
});

describe('clockSeconds', () => {
  // Bug prevented: a fresh 25 minute countdown reading 24:59 at once, or a stopwatch rounding up.
  it('rounds a countdown up and a stopwatch down', () => {
    const t = timer();
    expect(clockSeconds(t, t.startedAt)).toBe(1500);
    expect(clockSeconds(t, t.startedAt + 1)).toBe(1500);
    expect(clockSeconds(t, t.startedAt + 1001)).toBe(1499);
    const watch = timer({ kind: 'stopwatch', minutes: null });
    expect(clockSeconds(watch, watch.startedAt + 999)).toBe(0);
    expect(clockSeconds(watch, watch.startedAt + 1000)).toBe(1);
  });
});

describe('formatFocusTotal', () => {
  it('is at least a minute', () => {
    expect(formatFocusTotal(5)).toBe('1 min');
    expect(formatFocusTotal(45 * 60)).toBe('45 min');
    expect(formatFocusTotal(4500)).toBe('1 h 15 min');
  });
});

describe('cleanMinutes', () => {
  // Bug prevented: a zero, fractional, text or huge length reaching a timer.
  it('accepts whole minutes from 1 to the maximum', () => {
    for (const bad of [0, -1, 2.5, '25', NaN, 181, null])
      expect(cleanMinutes(bad, 25, 180)).toBe(25);
    expect(cleanMinutes(1, 25, 180)).toBe(1);
    expect(cleanMinutes(180, 25, 180)).toBe(180);
  });
});

describe('trayStatus', () => {
  const t0 = 1_000_000;
  const name = 'Write plan';
  // Bug prevented: the tray showing stale or malformed text for a running, paused or break timer.
  it('has no title and the due summary when nothing runs', () => {
    expect(trayStatus(['3 due today', '1 reminder'], null, t0, undefined)).toEqual({
      title: null,
      tooltip: 'Get To It · 3 due today, 1 reminder',
    });
    expect(trayStatus([], null, t0, undefined)).toEqual({ title: null, tooltip: 'Get To It' });
  });

  it('shows a stopwatch and a countdown', () => {
    expect(
      trayStatus([], timer({ kind: 'stopwatch', minutes: null }), 1_000_000 + 754_000, name),
    ).toEqual({
      title: '12:34',
      tooltip: 'Get To It · 12:34 on “Write plan”',
    });
    expect(trayStatus([], timer(), 1_000_000 + 1000, name)).toEqual({
      title: '24:59',
      tooltip: 'Get To It · 24:59 left on “Write plan”',
    });
  });

  it('shows a break and a pause', () => {
    const br = timer({ kind: 'break', itemId: null, minutes: 5 });
    expect(trayStatus([], br, 1_000_000 + 1000, undefined)).toEqual({
      title: '4:59',
      tooltip: 'Get To It · Break, 4:59 left',
    });
    const paused = timer({ kind: 'stopwatch', minutes: null, pausedAt: 1_000_000 + 754_000 });
    expect(trayStatus([], paused, 1_000_000 + 900_000, name)).toEqual({
      title: '⏸ 12:34',
      tooltip: 'Get To It · Paused · 12:34 on “Write plan”',
    });
  });
});
