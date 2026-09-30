import { describe, expect, it } from 'vitest';
import { bySortKey, keyAtEnd, keyAtStart, keyBetween } from './order';

describe('sort keys', () => {
  it('places keys between neighbours', () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });

  it('adds keys at either end', () => {
    const keys = ['a1', 'a3', 'a2'];
    expect(keyAtEnd(keys) > 'a3').toBe(true);
    expect(keyAtStart(keys) < 'a1').toBe(true);
    expect(keyAtEnd([])).toBe(keyBetween(null, null));
  });

  it('tolerates duplicate neighbours', () => {
    const k = keyBetween('a1', 'a1');
    expect(k > 'a1').toBe(true);
  });

  it('breaks ties by id', () => {
    const rows = [
      { id: 'b', sortKey: 'a0' },
      { id: 'a', sortKey: 'a0' },
    ];
    expect(rows.sort(bySortKey).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
