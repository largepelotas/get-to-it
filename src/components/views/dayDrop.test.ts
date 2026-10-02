import { describe, expect, it } from 'vitest';
import { alldayDropId, dateFromDropId, dayDropId, dropKind, slotDropId } from './dayDrop';

describe('dayDrop ids', () => {
  // Bug prevented: a drop on a row or other target being read as a day and rescheduling to garbage.
  it('round-trips a date and rejects other ids', () => {
    expect(dayDropId('2026-10-02')).toBe('day:2026-10-02');
    expect(dateFromDropId('day:2026-10-02')).toBe('2026-10-02');
    // Bug prevented: the strip button and the day's section sharing an id, so dnd-kit saw only one of them.
    expect(dayDropId('2026-10-02', 'strip')).not.toBe(dayDropId('2026-10-02'));
    expect(dateFromDropId(dayDropId('2026-10-02', 'strip'))).toBe('2026-10-02');
    expect(dateFromDropId('day:nope')).toBeNull();
    expect(dateFromDropId('2026-10-02')).toBeNull();
    expect(dateFromDropId('item-1')).toBeNull();
  });
});

describe('all-day and slot drop ids', () => {
  // Bug prevented: an all-day or time-grid drop not being read as a date, so it silently did nothing.
  it('name a date and a kind', () => {
    expect(alldayDropId('2026-10-02')).toBe('allday:2026-10-02');
    expect(slotDropId('2026-10-02')).toBe('slot:2026-10-02');
    expect(dateFromDropId('allday:2026-10-02')).toBe('2026-10-02');
    expect(dateFromDropId('slot:2026-10-02')).toBe('2026-10-02');
    expect(dropKind('day:2026-10-02')).toBe('day');
    expect(dropKind('strip:2026-10-02')).toBe('day');
    expect(dropKind('allday:2026-10-02')).toBe('allday');
    expect(dropKind('slot:2026-10-02')).toBe('slot');
    expect(dropKind('slot:nope')).toBeNull();
    expect(dropKind('item-1')).toBeNull();
  });

  // Bug prevented: the all-day cell and the time column of one date sharing an id (dnd-kit keeps one).
  it('differ from each other and from the day id', () => {
    const ids = new Set([
      dayDropId('2026-10-02'),
      alldayDropId('2026-10-02'),
      slotDropId('2026-10-02'),
    ]);
    expect(ids.size).toBe(3);
  });
});
