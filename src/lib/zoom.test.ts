import { describe, expect, it } from 'vitest';
import { cleanZoom, DEFAULT_ZOOM, formatZoom, stepZoom, ZOOM_LEVELS } from './zoom';

describe('zoom levels', () => {
  it('offers 100% and keeps the levels in order', () => {
    expect(ZOOM_LEVELS).toContain(DEFAULT_ZOOM);
    expect([...ZOOM_LEVELS].sort((a, b) => a - b)).toEqual(ZOOM_LEVELS);
  });

  it('reads anything that is not an offered level as 100%', () => {
    expect(cleanZoom(1.25)).toBe(1.25);
    expect(cleanZoom(1.3)).toBe(1);
    expect(cleanZoom('1.5')).toBe(1);
    expect(cleanZoom(undefined)).toBe(1);
    expect(cleanZoom(NaN)).toBe(1);
  });

  it('steps through the levels and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 1)).toBe(
      ZOOM_LEVELS[ZOOM_LEVELS.length - 1],
    );
    expect(stepZoom(ZOOM_LEVELS[0], -1)).toBe(ZOOM_LEVELS[0]);
    // A bad stored value steps from 100%.
    expect(stepZoom(7, 1)).toBe(1.1);
  });

  it('formats as a percentage', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(1.25)).toBe('125%');
    expect(formatZoom(0.9)).toBe('90%');
  });
});
