import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  formatDateKey,
  formatDue,
  formatDuration,
  formatTime,
  formatTimeRange,
  isOverdue,
  isTimeAfter,
  msUntilTomorrow,
  nextWeekKey,
} from './dates';

describe('dates', () => {
  it('finds the start of next week', () => {
    // 30 September 2026 is a Wednesday.
    expect(nextWeekKey('2026-09-30', 1)).toBe('2026-10-05');
    expect(nextWeekKey('2026-09-30', 0)).toBe('2026-10-04');
    // On the first day of the week, it's a week later.
    expect(nextWeekKey('2026-10-05', 1)).toBe('2026-10-12');
  });

  it('labels dates relative to today', () => {
    const now = new Date(2026, 8, 30, 12);
    expect(formatDateKey('2026-09-30', now)).toBe('Today');
    expect(formatDateKey('2026-10-01', now)).toBe('Tomorrow');
    expect(formatDateKey('2026-10-02', now)).toBe('Friday');
    expect(formatDateKey('2026-10-09', now)).toBe('Fri, Oct 9');
    expect(formatDateKey('2027-01-04', now)).toBe('Mon, Jan 4, 2027');
  });

  it('treats a passed time today as overdue', () => {
    const now = new Date(2026, 8, 30, 12);
    expect(isOverdue('2026-09-30', '11:00', now)).toBe(true);
    expect(isOverdue('2026-09-30', '13:00', now)).toBe(false);
    expect(isOverdue('2026-09-30', null, now)).toBe(false);
    expect(isOverdue('2026-09-29', null, now)).toBe(true);
  });

  it('counts down to midnight', () => {
    expect(msUntilTomorrow(new Date(2026, 8, 30, 23, 59))).toBe(60_000);
  });
});

describe('time ranges', () => {
  const now = new Date(2026, 8, 30, 12);

  // Bug prevented: a range showing only its start, or with spaces/hyphen instead of an en dash.
  it('formats a due date with a range', () => {
    expect(formatDue('2026-10-01', '14:00', now, '15:30')).toBe(
      `Tomorrow ${formatTime('14:00')}\u2013${formatTime('15:30')}`,
    );
    expect(formatDue('2026-10-01', '14:00', now)).toBe(`Tomorrow ${formatTime('14:00')}`);
    expect(formatDue('2026-10-01', null, now, '15:30')).toBe('Tomorrow');
  });

  it('formats a time range', () => {
    expect(formatTimeRange('14:00', null)).toBe(formatTime('14:00'));
    expect(formatTimeRange('14:00', '15:30')).toBe(
      `${formatTime('14:00')}\u2013${formatTime('15:30')}`,
    );
  });

  // Bug prevented: "for 2h" at 23:00 producing an end time on the next day (e.g. 01:00).
  it('adds minutes without leaving the day', () => {
    expect(addMinutes('14:00', 45)).toBe('14:45');
    expect(addMinutes('14:30', 90)).toBe('16:00');
    expect(addMinutes('23:00', 59)).toBe('23:59');
    expect(addMinutes('23:00', 60)).toBeNull();
    expect(addMinutes('14:00', 0)).toBeNull();
    expect(addMinutes('14:00', -5)).toBeNull();
  });

  it('formats a duration', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(120)).toBe('2 h');
  });

  it('compares times strictly', () => {
    expect(isTimeAfter('14:30', '14:00')).toBe(true);
    expect(isTimeAfter('14:00', '14:00')).toBe(false);
    expect(isTimeAfter('09:00', '14:00')).toBe(false);
  });
});
