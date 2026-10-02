import { isDateKey, type DateKey } from '@/lib/dates';

/**
 * The drop target id for a day in Upcoming. A day's section and its week strip
 * button are both targets for the same date, so they need different ids
 * (dnd-kit keeps only one droppable per id).
 */
export function dayDropId(date: DateKey, source: 'section' | 'strip' = 'section'): string {
  return `${source === 'strip' ? 'strip' : 'day'}:${date}`;
}

/** The drop target for a day's all-day row in the week and 3-day layouts: the date only, time cleared. */
export function alldayDropId(date: DateKey): string {
  return `allday:${date}`;
}

/** The drop target for a day's time grid column: the date plus the time under the pointer. */
export function slotDropId(date: DateKey): string {
  return `slot:${date}`;
}

/** The day a drop target id names (any of the day, strip, all-day or slot targets), or null for any other id. */
export function dateFromDropId(id: string): DateKey | null {
  const match = /^(?:day|strip|allday|slot):(.+)$/.exec(id);
  return match && isDateKey(match[1]) ? match[1] : null;
}

/** What kind of target a drop id is: a whole day, an all-day row, a time-grid column, or none. */
export function dropKind(id: string): 'day' | 'allday' | 'slot' | null {
  if (!dateFromDropId(id)) return null;
  const source = id.slice(0, id.indexOf(':'));
  return source === 'allday' || source === 'slot' ? source : 'day';
}
