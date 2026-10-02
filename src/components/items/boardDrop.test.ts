import { describe, expect, it } from 'vitest';
import { columnDropId, columnKeyFromDropId } from './boardDrop';

describe('board drop ids', () => {
  // Bug prevented: a column key with a colon in it ("section:abc") is cut short when the id is parsed back, so the drop lands nowhere.
  it('round-trips a column key, colons included', () => {
    expect(columnKeyFromDropId(columnDropId('section:abc'))).toBe('section:abc');
    expect(columnKeyFromDropId(columnDropId('p1'))).toBe('p1');
  });

  // Bug prevented: a day or strip drop id is mistaken for a column and moves a card on the wrong target.
  it('ignores ids that are not columns', () => {
    expect(columnKeyFromDropId('day:2026-10-02')).toBeNull();
  });
});
