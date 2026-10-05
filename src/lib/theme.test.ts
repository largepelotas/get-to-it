import { describe, expect, it } from 'vitest';
import { PALETTE_NAMES } from '@/data/types';
import { LEGACY_PALETTES, resolvePaletteName } from './theme';

describe('resolvePaletteName', () => {
  // A user with a removed palette saved must see its replacement, not Graphite.
  it('maps each removed palette to its replacement', () => {
    expect(resolvePaletteName('stone')).toBe('moss');
    expect(resolvePaletteName('sage')).toBe('moss');
    expect(resolvePaletteName('dusk')).toBe('plum');
    expect(resolvePaletteName('midnight')).toBe('graphite');
  });

  it('keeps current names and rejects unknown ones', () => {
    for (const p of PALETTE_NAMES) expect(resolvePaletteName(p)).toBe(p);
    expect(resolvePaletteName('nope')).toBeUndefined();
    expect(resolvePaletteName('toString')).toBeUndefined();
    expect(resolvePaletteName(3)).toBeUndefined();
  });

  it('only maps onto palettes that exist', () => {
    for (const to of Object.values(LEGACY_PALETTES)) expect(PALETTE_NAMES).toContain(to);
  });
});
