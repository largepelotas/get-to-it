import type ICALModule from 'ical.js';
import { addDaysKey, toDateKey, toTimeString, type DateKey } from '@/lib/dates';

type ICAL = typeof ICALModule;
type IcalTime = InstanceType<ICAL['Time']>;
type IcalEvent = InstanceType<ICAL['Event']>;

/** One event on one day, read-only. `startTime === null` means all day. */
export interface ExternalEvent {
  /** Stable across refreshes and unique per entry (uid, occurrence start and day). */
  id: string;
  title: string;
  date: DateKey;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
}

/** An event across several days is one entry per day; this stops a runaway feed. */
export const MAX_EVENTS_PER_FEED = 5000;
/** Stops a rule that repeats every second from running for ever. */
const MAX_OCCURRENCES_PER_EVENT = 50_000;

/** Where an entry that carries on past midnight ends. */
const END_OF_DAY = '23:59';

const pad = (n: number) => String(n).padStart(2, '0');

/** The date of an all-day value, which has no time zone to convert. */
function dateKeyOf(time: IcalTime): DateKey {
  return `${String(time.year).padStart(4, '0')}-${pad(time.month)}-${pad(time.day)}`;
}

function isCancelled(event: IcalEvent): boolean {
  const status = event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

/**
 * The entries one occurrence makes inside the window: usually one, one per day
 * for an event spanning days.
 */
function entriesFor(
  base: string,
  title: string,
  location: string | null,
  start: IcalTime,
  end: IcalTime | null,
  from: DateKey,
  to: DateKey,
): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  const add = (date: DateKey, startTime: string | null, endTime: string | null) => {
    if (date < from || date > to) return;
    out.push({ id: `${base}|${date}`, title, date, startTime, endTime, location });
  };

  if (start.isDate) {
    // An all-day end is exclusive: a one-day event ends the next day.
    const first = dateKeyOf(start);
    const lastExclusive = end && end.isDate ? dateKeyOf(end) : addDaysKey(first, 1);
    const last = lastExclusive > first ? addDaysKey(lastExclusive, -1) : first;
    for (let day = first; day <= last; day = addDaysKey(day, 1)) {
      if (day > to) break;
      add(day, null, null);
    }
    return out;
  }

  const startDate = start.toJSDate();
  const endDate = end && !end.isDate ? end.toJSDate() : null;
  const firstDay = toDateKey(startDate);
  if (!endDate || endDate.getTime() <= startDate.getTime()) {
    add(firstDay, toTimeString(startDate), null);
    return out;
  }
  let lastDay = toDateKey(endDate);
  // Ending exactly at midnight belongs to the day before.
  const atMidnight = toTimeString(endDate) === '00:00' && endDate.getSeconds() === 0;
  if (lastDay > firstDay && atMidnight) lastDay = addDaysKey(lastDay, -1);
  if (lastDay <= firstDay) {
    const sameDay = toDateKey(endDate) === firstDay;
    add(firstDay, toTimeString(startDate), sameDay ? toTimeString(endDate) : END_OF_DAY);
    return out;
  }
  for (let day = firstDay; day <= lastDay; day = addDaysKey(day, 1)) {
    if (day > to) break;
    if (day === firstDay) add(day, toTimeString(startDate), END_OF_DAY);
    else if (day === lastDay && !atMidnight) add(day, '00:00', toTimeString(endDate));
    else add(day, null, null);
  }
  return out;
}

/**
 * Reads calendar text into read-only events dated between `from` and `to`
 * (inclusive, local days). Times are converted to this computer's time zone;
 * repeating events are expanded inside the window. Single bad events are
 * skipped; text that isn't a calendar throws.
 *
 * Async because the parser is loaded on first use, to keep it out of the
 * startup bundle.
 */
export async function parseFeed(
  text: string,
  from: DateKey,
  to: DateKey,
): Promise<ExternalEvent[]> {
  const ICAL = (await import('ical.js')).default;

  let root: InstanceType<ICAL['Component']>;
  try {
    root = new ICAL.Component(ICAL.parse(text.replace(/^\u{feff}/u, '')));
  } catch {
    throw new Error('That isn’t a calendar.');
  }
  if (root.name !== 'vcalendar') throw new Error('That isn’t a calendar.');

  // Outlook names zones like "GMT Standard Time" and ships their definitions.
  ICAL.TimezoneService.reset();
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A zone that can't be read leaves its events floating.
    }
  }

  // Group by UID: a master (or lone event) and the changed occurrences that belong to it.
  const groups = new Map<
    string,
    { masters: InstanceType<ICAL['Component']>[]; changes: InstanceType<ICAL['Component']>[] }
  >();
  for (const component of root.getAllSubcomponents('vevent')) {
    const uid = String(component.getFirstPropertyValue('uid') ?? '');
    const key = uid || `no-uid-${groups.size}`;
    const group = groups.get(key) ?? { masters: [], changes: [] };
    groups.set(key, group);
    (component.hasProperty('recurrence-id') ? group.changes : group.masters).push(component);
  }

  const events: ExternalEvent[] = [];
  const room = () => events.length < MAX_EVENTS_PER_FEED;
  const push = (entries: ExternalEvent[]) => {
    for (const entry of entries) if (room()) events.push(entry);
  };
  // Occurrences a day either side of the window can move into it when their time zone differs.
  const limit = ICAL.Time.fromJSDate(new Date(`${addDaysKey(to, 2)}T00:00:00`), true);

  const describe = (event: IcalEvent) => {
    const title = String(event.component.getFirstPropertyValue('summary') ?? '').trim() || 'Busy';
    const place = String(event.component.getFirstPropertyValue('location') ?? '').trim();
    return { title, location: place || null };
  };

  for (const [uid, group] of groups) {
    // A changed occurrence with no master is just a single event.
    const standalone = group.masters.length ? [] : group.changes;
    for (const component of [...group.masters, ...standalone]) {
      if (!room()) break;
      try {
        const event = new ICAL.Event(component, {
          // Without this list ical.js would relate every changed occurrence in the file.
          exceptions: group.masters.includes(component) ? group.changes : [],
        });
        if (!event.isRecurring()) {
          if (isCancelled(event)) continue;
          const start = event.startDate;
          const { title, location } = describe(event);
          push(
            entriesFor(
              `${uid}|${start.toString()}`,
              title,
              location,
              start,
              event.endDate,
              from,
              to,
            ),
          );
          continue;
        }
        if (isCancelled(event)) continue;
        const iterator = event.iterator();
        for (let count = 0; count < MAX_OCCURRENCES_PER_EVENT && room(); count++) {
          const occurrence = iterator.next();
          if (!occurrence || occurrence.compare(limit) > 0) break;
          const details = event.getOccurrenceDetails(occurrence);
          if (isCancelled(details.item)) continue;
          const { title, location } = describe(details.item);
          push(
            entriesFor(
              `${uid}|${occurrence.toString()}`,
              title,
              location,
              details.startDate,
              details.endDate,
              from,
              to,
            ),
          );
        }
      } catch {
        // One malformed event doesn't spoil the rest.
      }
    }
  }
  return events;
}
