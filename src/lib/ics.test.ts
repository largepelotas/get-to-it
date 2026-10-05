import { describe, expect, it } from 'vitest';
import { toDateKey, toTimeString } from './dates';
import { parseFeed } from './ics';

// Every fixture here is invented. Lines are joined with CRLF, as calendar files are.
const cal = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n');
const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

const FROM = '2026-10-01';
const TO = '2026-10-31';
const parse = (text: string, from = FROM, to = TO) => parseFeed(text, from, to);

describe('parseFeed', () => {
  it('reads a timed event', async () => {
    const out = await parse(
      cal(
        event(
          'UID:a',
          'DTSTART:20261006T093000',
          'DTEND:20261006T103000',
          'SUMMARY:Team sync',
          'LOCATION:Room 4',
        ),
      ),
    );
    expect(out).toEqual([
      expect.objectContaining({
        title: 'Team sync',
        date: '2026-10-06',
        startTime: '09:30',
        endTime: '10:30',
        location: 'Room 4',
      }),
    ]);
  });

  // Bug prevented: an all-day event shows a day too many, because DTEND is exclusive.
  it('treats an all-day end as exclusive', async () => {
    const out = await parse(
      cal(
        event('UID:a', 'DTSTART;VALUE=DATE:20261007', 'DTEND;VALUE=DATE:20261009', 'SUMMARY:Trip'),
        event('UID:b', 'DTSTART;VALUE=DATE:20261012', 'SUMMARY:Holiday'),
      ),
    );
    expect(out.map((e) => [e.title, e.date, e.startTime])).toEqual([
      ['Trip', '2026-10-07', null],
      ['Trip', '2026-10-08', null],
      ['Holiday', '2026-10-12', null],
    ]);
  });

  it('splits a timed event over several days', async () => {
    const out = await parse(
      cal(event('UID:a', 'DTSTART:20261008T220000', 'DTEND:20261010T080000', 'SUMMARY:Flight')),
    );
    expect(out.map((e) => [e.date, e.startTime, e.endTime])).toEqual([
      ['2026-10-08', '22:00', '23:59'],
      ['2026-10-09', null, null],
      ['2026-10-10', '00:00', '08:00'],
    ]);
  });

  // Bug prevented: an event ending at midnight leaves a bogus empty entry on the next day.
  it('adds nothing for a day an event ends at the start of', async () => {
    const out = await parse(
      cal(event('UID:a', 'DTSTART:20261012T200000', 'DTEND:20261013T000000', 'SUMMARY:Late')),
    );
    expect(out.map((e) => [e.date, e.startTime, e.endTime])).toEqual([
      ['2026-10-12', '20:00', '23:59'],
    ]);
  });

  // Bug prevented: the last full day of an event ending at midnight shows as 00:00-00:00.
  it('makes the last day all day when a long event ends at midnight', async () => {
    const out = await parse(
      cal(event('UID:a', 'DTSTART:20261005T100000', 'DTEND:20261007T000000', 'SUMMARY:Course')),
    );
    expect(out.map((e) => [e.date, e.startTime, e.endTime])).toEqual([
      ['2026-10-05', '10:00', '23:59'],
      ['2026-10-06', null, null],
    ]);
  });

  it('repeats weekly, honouring EXDATE and a moved occurrence', async () => {
    const out = await parse(
      cal(
        event(
          'UID:w',
          'DTSTART:20261005T100000',
          'DTEND:20261005T110000',
          'RRULE:FREQ=WEEKLY;COUNT=5',
          'EXDATE:20261012T100000',
          'SUMMARY:Weekly',
        ),
        event(
          'UID:w',
          'RECURRENCE-ID:20261019T100000',
          'DTSTART:20261020T140000',
          'DTEND:20261020T150000',
          'SUMMARY:Weekly (moved)',
        ),
        // Another event's change must not leak into this one.
        event(
          'UID:other',
          'RECURRENCE-ID:20261026T100000',
          'DTSTART:20261026T180000',
          'SUMMARY:Elsewhere',
        ),
      ),
    );
    const weekly = out.filter((e) => e.title.startsWith('Weekly'));
    expect(weekly.map((e) => [e.title, e.date, e.startTime])).toEqual([
      ['Weekly', '2026-10-05', '10:00'],
      ['Weekly (moved)', '2026-10-20', '14:00'],
      ['Weekly', '2026-10-26', '10:00'],
    ]);
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length);
  });

  // Bug prevented: Outlook's own zone names show at the wrong hour.
  it('converts a time zone defined in the file to this computer’s zone', async () => {
    const out = await parse(
      cal(
        [
          'BEGIN:VTIMEZONE',
          'TZID:Test Standard Time',
          'BEGIN:STANDARD',
          'DTSTART:16010101T000000',
          'TZOFFSETFROM:+0300',
          'TZOFFSETTO:+0300',
          'END:STANDARD',
          'END:VTIMEZONE',
        ].join('\r\n'),
        event(
          'UID:z',
          'DTSTART;TZID=Test Standard Time:20261006T100000',
          'DTEND;TZID=Test Standard Time:20261006T110000',
          'SUMMARY:Zoned',
        ),
      ),
    );
    const start = new Date(Date.UTC(2026, 9, 6, 7, 0));
    const end = new Date(Date.UTC(2026, 9, 6, 8, 0));
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe(toDateKey(start));
    expect(out[0].startTime).toBe(toTimeString(start));
    expect(out[0].endTime).toBe(toTimeString(end));
  });

  it('converts a UTC time', async () => {
    const out = await parse(
      cal(event('UID:u', 'DTSTART:20261006T120000Z', 'DTEND:20261006T130000Z', 'SUMMARY:Utc')),
    );
    const start = new Date(Date.UTC(2026, 9, 6, 12, 0));
    expect(out[0].date).toBe(toDateKey(start));
    expect(out[0].startTime).toBe(toTimeString(start));
  });

  it('skips cancelled events and cancelled occurrences', async () => {
    const out = await parse(
      cal(
        event('UID:c', 'DTSTART:20261006T090000', 'STATUS:CANCELLED', 'SUMMARY:Gone'),
        event('UID:r', 'DTSTART:20261005T100000', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Daily'),
        event(
          'UID:r',
          'RECURRENCE-ID:20261006T100000',
          'DTSTART:20261006T100000',
          'STATUS:CANCELLED',
          'SUMMARY:Daily',
        ),
      ),
    );
    expect(out.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('only gives the days inside the window of a repeat', async () => {
    const text = cal(
      event('UID:d', 'DTSTART:20261001T080000', 'RRULE:FREQ=DAILY;COUNT=10', 'SUMMARY:Daily'),
    );
    const out = await parse(text, '2026-10-03', '2026-10-05');
    expect(out.map((e) => e.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  it('names an untitled event Busy and keeps going past a broken one', async () => {
    const out = await parse(
      cal(event('UID:bad', 'SUMMARY:No start'), event('UID:ok', 'DTSTART:20261006T090000')),
    );
    expect(out.map((e) => e.title)).toEqual(['Busy']);
  });

  it('keeps ids the same between parses', async () => {
    const text = cal(
      event('UID:d', 'DTSTART:20261001T080000', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Daily'),
    );
    const first = await parse(text);
    const second = await parse(text);
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
    expect(new Set(first.map((e) => e.id)).size).toBe(3);
  });

  it('caps a feed at 5,000 entries', async () => {
    const text = cal(
      event('UID:d', 'DTSTART:20200101T080000', 'RRULE:FREQ=DAILY;COUNT=9000', 'SUMMARY:Lots'),
    );
    expect(await parse(text, '2020-01-01', '2045-01-01')).toHaveLength(5000);
  });

  it('throws on text that isn’t a calendar', async () => {
    await expect(parse('<html>hello</html>')).rejects.toThrow();
    await expect(parse('')).rejects.toThrow();
  });
});
