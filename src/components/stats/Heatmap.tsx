import { format } from 'date-fns';
import { fromDateKey, type DateKey } from '@/lib/dates';
import { heatLevel, type HeatLevel } from '@/store/stats';

/** The empty shade, then four steps of the accent colour (so it is right in every theme). */
const SHADE: Record<HeatLevel, string> = {
  0: 'var(--line)',
  1: 'color-mix(in srgb, var(--accent) 30%, transparent)',
  2: 'color-mix(in srgb, var(--accent) 50%, transparent)',
  3: 'color-mix(in srgb, var(--accent) 75%, transparent)',
  4: 'var(--accent)',
};

export interface HeatmapProps {
  /** Columns of seven days (null for a day to leave empty), oldest column first. */
  weeks: (DateKey | null)[][];
  /** The number for each day; a missing day counts as 0. */
  values: Map<DateKey, number>;
  /** The text for one day, used as the square's tooltip. */
  label: (day: DateKey, value: number) => string;
  /** What a screen reader says for the whole map, which it reads as one image. */
  name: string;
}

const CELL = 12;
const GAP = 3;

/**
 * A grid of days shaded by a number, a column per week with month names along
 * the top. It knows nothing about what the numbers mean. To a screen reader it
 * is a single image called `name`; the squares are hidden from it.
 */
export function Heatmap({ weeks, values, label, name }: HeatmapProps) {
  let max = 0;
  for (const week of weeks) {
    for (const day of week) if (day) max = Math.max(max, values.get(day) ?? 0);
  }
  // A month's name sits over the column that holds its first day.
  const months = weeks.map((week) => {
    const first = week.find((d) => d !== null && d.endsWith('-01'));
    return first ? format(fromDateKey(first), 'MMM') : '';
  });
  const columns = `repeat(${weeks.length}, ${CELL}px)`;

  return (
    <div
      // Focusable so the keyboard can scroll it sideways when the window is narrow.
      tabIndex={0}
      role="group"
      aria-label="Heatmap"
      className="overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div role="img" aria-label={name} className="w-max">
        <div
          aria-hidden
          className="mb-1 grid h-4 text-[10px] text-fg-muted"
          style={{ gridTemplateColumns: columns, columnGap: GAP }}
        >
          {months.map((m, i) => (
            <span key={i} className="overflow-visible whitespace-nowrap">
              {m}
            </span>
          ))}
        </div>
        <div aria-hidden className="flex" style={{ gap: GAP }}>
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col" style={{ gap: GAP }}>
              {week.map((day, d) => {
                if (!day) return <div key={d} style={{ width: CELL, height: CELL }} />;
                const value = values.get(day) ?? 0;
                return (
                  <div
                    key={d}
                    title={label(day, value)}
                    className="rounded-[3px]"
                    style={{
                      width: CELL,
                      height: CELL,
                      background: SHADE[heatLevel(value, max)],
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
