/*
 * The window's zoom. A scale factor: 1 is 100%. The setting belongs to this
 * computer (it's about the screen, not the data), so it isn't exported.
 */

export const DEFAULT_ZOOM = 1;

/** The levels offered, smallest first. */
export const ZOOM_LEVELS: readonly number[] = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** A level the app offers. Anything else (a hand-edited file) reads as 100%. */
export function cleanZoom(value: unknown): number {
  return typeof value === 'number' && ZOOM_LEVELS.includes(value) ? value : DEFAULT_ZOOM;
}

/** The level one step up (1) or down (-1) from `current`, stopping at the ends. */
export function stepZoom(current: number, step: 1 | -1): number {
  const index = ZOOM_LEVELS.indexOf(cleanZoom(current)) + step;
  return ZOOM_LEVELS[Math.min(Math.max(index, 0), ZOOM_LEVELS.length - 1)];
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
