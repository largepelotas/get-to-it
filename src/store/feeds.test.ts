import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, setSetting } from './data';
import { eventsByDay, refreshFeeds, removeFeed, resetFeedsForTests, useFeeds } from './feeds';

// An invented calendar with one event, on a day inside the window.
const ics = (summary: string, start = '20261006T093000', uid = 'u1') =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    start.length === 8 ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

const A = { id: 'A', name: 'Alpha', url: 'https://example.test/a.ics' };
const B = { id: 'B', name: 'Beta', url: 'https://example.test/b.ics' };
const TODAY = '2026-10-05';

beforeEach(() => {
  resetForTests(new MemoryRepository());
  resetFeedsForTests();
});

describe('feed store', () => {
  it('fetches every feed and groups events by day, all day first then by time', async () => {
    setSetting('calendarFeeds', [A, B]);
    const fetchText = vi.fn(async (url: string) =>
      url.endsWith('a.ics') ? ics('Late', '20261006T150000') : ics('Whole day', '20261006'),
    );
    await refreshFeeds(fetchText, TODAY);
    const day = eventsByDay().get('2026-10-06')!;
    expect(day.map((e) => e.title)).toEqual(['Whole day', 'Late']);
    expect(day.map((e) => [e.feedId, e.feedName])).toEqual([
      ['B', 'Beta'],
      ['A', 'Alpha'],
    ]);
    expect(useFeeds.getState().feeds.A.status).toBe('ok');
  });

  // Bug prevented: one broken link blanks every calendar, or a blip wipes the events already shown.
  it('keeps going when one feed fails, and keeps the last good events', async () => {
    setSetting('calendarFeeds', [A, B]);
    await refreshFeeds(async () => ics('Fine'), TODAY);
    const fetchText = vi.fn(async (url: string) => {
      if (url.endsWith('a.ics')) throw new Error('Couldn’t reach the calendar.');
      return ics('Fine');
    });
    await refreshFeeds(fetchText, TODAY);
    const { feeds } = useFeeds.getState();
    expect(feeds.A.status).toBe('error');
    expect(feeds.A.error).toBe('Couldn’t reach the calendar.');
    expect(feeds.A.events).toHaveLength(1);
    expect(feeds.B.status).toBe('ok');
    expect(eventsByDay().get('2026-10-06')).toHaveLength(2);
  });

  it('turns a page that isn’t a calendar into an error', async () => {
    setSetting('calendarFeeds', [A]);
    await refreshFeeds(async () => '<html></html>', TODAY);
    expect(useFeeds.getState().feeds.A.status).toBe('error');
  });

  it('drops a removed feed’s events at once', async () => {
    setSetting('calendarFeeds', [A, B]);
    await refreshFeeds(async () => ics('Fine'), TODAY);
    removeFeed('A');
    expect(Object.keys(useFeeds.getState().feeds)).toEqual(['B']);
    expect(eventsByDay().get('2026-10-06')).toHaveLength(1);
  });

  // Bug prevented: the Settings button and the hook both fetching the same link at once.
  it('joins a refresh already running instead of fetching again', async () => {
    setSetting('calendarFeeds', [A]);
    let release: (text: string) => void = () => {};
    const slow = new Promise<string>((resolve) => (release = resolve));
    const first = refreshFeeds(() => slow, TODAY);
    const fetchAgain = vi.fn(async () => ics('New'));
    const second = refreshFeeds(fetchAgain, TODAY);
    expect(fetchAgain).not.toHaveBeenCalled();
    release(ics('Old'));
    await Promise.all([first, second]);
    expect(eventsByDay().get('2026-10-06')![0].title).toBe('Old');
  });
});
