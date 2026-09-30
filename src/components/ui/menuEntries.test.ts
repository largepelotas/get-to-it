import { describe, expect, it } from 'vitest';
import { cleanEntries } from './menuEntries';

describe('cleanEntries', () => {
  it('drops falsy entries and stray separators', () => {
    const noop = () => {};
    const entries = cleanEntries([
      { kind: 'separator' },
      false,
      { label: 'A', onSelect: noop },
      { kind: 'separator' },
      null,
      { kind: 'separator' },
      { label: 'B', onSelect: noop },
      { kind: 'separator' },
    ]);
    expect(
      entries.map((e) => (e.kind === 'separator' ? '-' : 'label' in e ? e.label : '')),
    ).toEqual(['A', '-', 'B']);
  });
});
