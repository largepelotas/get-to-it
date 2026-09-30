import { describe, expect, it } from 'vitest';
import { formatDateKey, isOverdue, msUntilTomorrow, nextWeekKey } from './dates';

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
