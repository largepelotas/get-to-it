import { describe, expect, it } from 'vitest';
import { dateFromDropId, dayDropId } from './dayDrop';

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
