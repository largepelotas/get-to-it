import type { CalendarFeed } from '@/data/types';

/**
 * Turns a pasted calendar link into the https link to fetch, or null if it
 * isn't one. `webcal://` is the same link with a different scheme.
 */
export function normalizeFeedUrl(raw: string): string | null {
  const text = raw.trim();
  const match = /^(https|webcal):\/\/(\S+)$/i.exec(text);
  return match ? `https://${match[2]}` : null;
}

/** True if the body, after an optional BOM and whitespace, starts like a calendar. */
export function looksLikeCalendar(body: string): boolean {
  return /^[\s\u{feff}]*BEGIN:VCALENDAR/iu.test(body);
}

/** Keeps the feeds that are well formed; anything else (a hand-edited file) is dropped. */
export function cleanFeeds(value: unknown): CalendarFeed[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CalendarFeed[] = [];
  for (const raw of value as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, name, url } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (typeof name !== 'string' || typeof url !== 'string' || !normalizeFeedUrl(url)) continue;
    seen.add(id);
    out.push({ id, name, url });
  }
  return out;
}
