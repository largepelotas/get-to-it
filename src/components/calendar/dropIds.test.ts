import { describe, expect, it } from 'vitest';
import { dropIds } from './dropIds';

describe('dropIds', () => {
  // Bug prevented: dragging one of several selected tasks moving only that one.
  it('moves the whole selection when the dragged task is in it', () => {
    expect(dropIds('b', ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('moves only the dragged task otherwise', () => {
    expect(dropIds('c', ['a', 'b'])).toEqual(['c']);
    expect(dropIds('a', ['a'])).toEqual(['a']);
    expect(dropIds('a', [])).toEqual(['a']);
  });
});
