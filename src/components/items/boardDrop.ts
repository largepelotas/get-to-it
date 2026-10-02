/*
 * Drop target ids for the columns of a board. Prefixed so a column can't be
 * mistaken for a day target (dayDrop.ts) if both are ever on one screen.
 */

const PREFIX = 'column:';

/** The drop id of the column with this key. */
export function columnDropId(key: string): string {
  return `${PREFIX}${key}`;
}

/** The column key a drop id names, or null for any other id. */
export function columnKeyFromDropId(id: string): string | null {
  return id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null;
}
