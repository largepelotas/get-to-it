import type { CSSProperties } from 'react';

/** The three places a calendar chip is drawn. */
export type ChipPlacement = 'month' | 'allDay' | 'block';

/** One line of `text-xs` text, in pixels. */
const LINE_PX = 16;

/**
 * How many whole lines of text fit in a time block `height` px tall. A block
 * too short for two lines gets no vertical padding, so its one line is not
 * clipped; a taller one has 2px above and below. `bordered` is the event's
 * dashed outline (1px each side).
 */
export function blockText(
  height: number,
  bordered: boolean,
): { lines: number; padded: boolean; style: CSSProperties } {
  const border = bordered ? 2 : 0;
  const padded = height - border >= 2 * LINE_PX + 4;
  const lines = Math.max(1, Math.floor((height - border - (padded ? 4 : 0)) / LINE_PX));
  return {
    lines,
    padded,
    style: {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: lines,
      overflow: 'hidden',
    },
  };
}

/*
 * Chip fills, mixed from the theme's own colours so they follow every colour
 * scheme. Dark themes get stronger mixes because a tint reads fainter there.
 * Written out in full so Tailwind finds each class.
 */
/** A task's resting fill, its hover and its selected fill. */
export const TASK_FILL =
  'bg-[color-mix(in_srgb,var(--accent)_18%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--accent)_30%,var(--surface))]';
export const TASK_FILL_HOVER =
  'hover:bg-[color-mix(in_srgb,var(--accent)_26%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--accent)_35%,var(--surface))]';
export const TASK_FILL_SELECTED =
  'bg-[color-mix(in_srgb,var(--accent)_36%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--accent)_40%,var(--surface))]';
/** An event's resting fill and its hover: neutral, so it differs from a task's. */
export const EVENT_FILL =
  'bg-[color-mix(in_srgb,var(--fg)_9%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--fg)_16%,var(--surface))]';
export const EVENT_FILL_HOVER =
  'hover:bg-[color-mix(in_srgb,var(--fg)_15%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--fg)_24%,var(--surface))]';
