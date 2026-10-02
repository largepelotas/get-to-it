import { isDateKey, type DateKey } from '@/lib/dates';

/**
 * The drop target id for a day in Upcoming. A day's section and its week strip
 * button are both targets for the same date, so they need different ids
 * (dnd-kit keeps only one droppable per id).
 */
export function dayDropId(date: DateKey, source: 'section' | 'strip' = 'section'): string {
  return `${source === 'strip' ? 'strip' : 'day'}:${date}`;
}

/** The day a drop target id names (a section's or a strip button's), or null for any other id. */
export function dateFromDropId(id: string): DateKey | null {
  const match = /^(?:day|strip):(.+)$/.exec(id);
  return match && isDateKey(match[1]) ? match[1] : null;
}
