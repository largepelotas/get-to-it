import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// Wednesday 30 September 2026, 10:00 local time.
const NOW = new Date(2026, 8, 30, 10, 0);

describe('parseQuickAdd', () => {
  it('leaves plain text alone', () => {
    const r = parseQuickAdd('Buy 2 apples', NOW);
    expect(r).toMatchObject({ text: 'Buy 2 apples', dueDate: null, dueTime: null, priority: 0 });
    expect(r.chips).toEqual([]);
  });

  it('reads a date and time', () => {
    const r = parseQuickAdd('Review deck tomorrow 3pm', NOW);
    expect(r).toMatchObject({ text: 'Review deck', dueDate: '2026-10-01', dueTime: '15:00' });
    expect(r.chips).toHaveLength(1);
  });

  it('drops a leftover preposition', () => {
    expect(parseQuickAdd('Pay invoice by Friday', NOW)).toMatchObject({
      text: 'Pay invoice',
      dueDate: '2026-10-02',
      dueTime: null,
    });
  });

  it('ignores a bare month', () => {
    expect(parseQuickAdd('Meeting notes for March', NOW).dueDate).toBeNull();
  });

  it('treats a small bare hour as the afternoon', () => {
    expect(parseQuickAdd('Call Sam at 5', NOW)).toMatchObject({
      text: 'Call Sam',
      dueDate: '2026-09-30',
      dueTime: '17:00',
    });
  });

  it('reads priority', () => {
    expect(parseQuickAdd('Fix the build p1', NOW)).toMatchObject({
      text: 'Fix the build',
      priority: 1,
    });
    expect(parseQuickAdd('Tidy desk !', NOW).priority).toBe(3);
    expect(parseQuickAdd('Ship it !!!', NOW).priority).toBe(1);
    expect(parseQuickAdd('Upgrade p10 cluster', NOW).priority).toBe(0);
  });

  it('reads weekday repeats with a time', () => {
    const r = parseQuickAdd('Standup every weekday 9:30', NOW);
    expect(r).toMatchObject({
      text: 'Standup',
      dueDate: '2026-10-01', // 9:30 today has passed, so tomorrow
      dueTime: '09:30',
      recurrence: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], mode: 'schedule' },
    });
    expect(r.chips).toContain('Every weekday');
  });

  it('reads named weekdays', () => {
    const r = parseQuickAdd('Team sync every mon and thu', NOW);
    expect(r).toMatchObject({
      text: 'Team sync',
      dueDate: '2026-10-01',
      recurrence: { freq: 'weekly', weekdays: [1, 4] },
    });
  });

  it('reads intervals and after-completion rules', () => {
    expect(parseQuickAdd('Water plants every 3 days after completion', NOW)).toMatchObject({
      text: 'Water plants',
      dueDate: '2026-09-30',
      recurrence: { freq: 'daily', interval: 3, mode: 'completion' },
    });
    expect(parseQuickAdd('Payroll every other week', NOW).recurrence).toMatchObject({
      freq: 'weekly',
      interval: 2,
    });
    expect(parseQuickAdd('Rent monthly', NOW).recurrence).toMatchObject({ freq: 'monthly' });
  });

  it('keeps the words when nothing else is left', () => {
    expect(parseQuickAdd('tomorrow', NOW)).toMatchObject({
      text: 'tomorrow',
      dueDate: '2026-10-01',
    });
  });
});
