import { describe, expect, it } from 'vitest';
import type { Recurrence } from '@/data/types';
import { describeRecurrence, firstOccurrence, nextDueDate, sanitizeRecurrence } from './recurrence';

const rule = (r: Partial<Recurrence>): Recurrence => ({
  freq: 'daily',
  interval: 1,
  mode: 'schedule',
  ...r,
});

// 2026-09-30 is a Wednesday.
const WED = '2026-09-30';

describe('nextDueDate on a schedule', () => {
  it('moves a daily task to tomorrow', () => {
    expect(nextDueDate(rule({}), WED, WED)).toBe('2026-10-01');
  });

  it('skips past dates when a task is finished late', () => {
    expect(nextDueDate(rule({}), '2026-09-25', WED)).toBe('2026-10-01');
    expect(nextDueDate(rule({ interval: 3 }), '2026-09-24', WED)).toBe('2026-10-03');
  });

  it('keeps early completions on the schedule', () => {
    expect(nextDueDate(rule({}), '2026-10-05', WED)).toBe('2026-10-06');
  });

  it('handles weekly rules with several weekdays', () => {
    const r = rule({ freq: 'weekly', weekdays: [1, 3, 5] });
    expect(nextDueDate(r, WED, WED)).toBe('2026-10-02'); // Fri
    expect(nextDueDate(r, '2026-10-02', '2026-10-02')).toBe('2026-10-05'); // Mon
  });

  it('handles every weekday', () => {
    const r = rule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] });
    expect(nextDueDate(r, '2026-10-02', '2026-10-02')).toBe('2026-10-05');
  });

  it('handles every other week', () => {
    const r = rule({ freq: 'weekly', interval: 2 });
    expect(nextDueDate(r, WED, WED)).toBe('2026-10-14');
    const multi = rule({ freq: 'weekly', interval: 2, weekdays: [1, 3] });
    expect(nextDueDate(multi, WED, WED)).toBe('2026-10-12');
  });

  it('clamps monthly dates to short months', () => {
    const r = rule({ freq: 'monthly' });
    expect(nextDueDate(r, '2026-01-31', '2026-01-31')).toBe('2026-02-28');
    expect(nextDueDate(r, '2026-01-31', '2026-02-28')).toBe('2026-03-31');
  });

  it('handles yearly rules and leap days', () => {
    const r = rule({ freq: 'yearly' });
    expect(nextDueDate(r, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
    expect(nextDueDate(r, WED, WED)).toBe('2027-09-30');
  });

  it('uses today when there is no due date', () => {
    expect(nextDueDate(rule({}), null, WED)).toBe('2026-10-01');
  });
});

describe('nextDueDate after completion', () => {
  it('counts from today', () => {
    const r = rule({ interval: 3, mode: 'completion' });
    expect(nextDueDate(r, '2026-09-01', WED)).toBe('2026-10-03');
    const m = rule({ freq: 'monthly', mode: 'completion' });
    expect(nextDueDate(m, null, '2026-01-31')).toBe('2026-02-28');
  });
});

describe('firstOccurrence', () => {
  it('snaps to the next matching weekday', () => {
    expect(firstOccurrence(rule({ freq: 'weekly', weekdays: [1] }), WED)).toBe('2026-10-05');
    expect(firstOccurrence(rule({ freq: 'weekly', weekdays: [3] }), WED)).toBe(WED);
    expect(firstOccurrence(rule({}), WED)).toBe(WED);
  });
});

describe('describeRecurrence', () => {
  it('describes common rules', () => {
    expect(describeRecurrence(rule({}))).toBe('Every day');
    expect(describeRecurrence(rule({ interval: 2 }))).toBe('Every 2 days');
    expect(describeRecurrence(rule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }))).toBe(
      'Every weekday',
    );
    expect(describeRecurrence(rule({ freq: 'weekly' }), WED)).toBe('Every Wednesday');
    expect(describeRecurrence(rule({ freq: 'weekly', interval: 2, weekdays: [5, 1] }))).toBe(
      'Every 2 weeks on Mon, Fri',
    );
    expect(describeRecurrence(rule({ freq: 'monthly' }), '2026-10-22')).toBe(
      'Every month on the 22nd',
    );
    expect(describeRecurrence(rule({ freq: 'monthly' }), '2026-10-11')).toBe(
      'Every month on the 11th',
    );
    expect(describeRecurrence(rule({ freq: 'yearly' }), WED)).toBe('Every year on Sep 30');
    expect(describeRecurrence(rule({ interval: 3, mode: 'completion' }))).toBe(
      '3 days after completion',
    );
  });
});

describe('sanitizeRecurrence', () => {
  it('rejects junk and fixes bad values', () => {
    expect(sanitizeRecurrence(null)).toBeNull();
    expect(sanitizeRecurrence({ freq: 'hourly' })).toBeNull();
    expect(sanitizeRecurrence({ freq: 'weekly', interval: -2, weekdays: [1, 1, 9] })).toEqual({
      freq: 'weekly',
      interval: 1,
      mode: 'schedule',
      weekdays: [1],
    });
  });
});
