import { describe, expect, it } from 'vitest';
import { cleanFeeds, looksLikeCalendar, normalizeFeedUrl } from './feedLinks';

describe('normalizeFeedUrl', () => {
  it('accepts https and rewrites webcal', () => {
    expect(normalizeFeedUrl(' https://example.test/a.ics ')).toBe('https://example.test/a.ics');
    expect(normalizeFeedUrl('webcal://example.test/a.ics')).toBe('https://example.test/a.ics');
  });

  // Bug prevented: a plain http, file or script link reaching the fetch.
  it('refuses anything else', () => {
    for (const bad of ['http://example.test/a.ics', 'file:///x', 'example.test', 'https://', '']) {
      expect(normalizeFeedUrl(bad)).toBeNull();
    }
  });
});

describe('looksLikeCalendar', () => {
  it('needs BEGIN:VCALENDAR first, after a BOM and spaces', () => {
    expect(looksLikeCalendar('﻿  \r\nBEGIN:VCALENDAR\r\n')).toBe(true);
    expect(looksLikeCalendar('<html>BEGIN:VCALENDAR')).toBe(false);
  });
});

describe('cleanFeeds', () => {
  // Bug prevented: a hand-edited or damaged setting breaks the refresh for every feed.
  it('drops malformed and duplicate entries', () => {
    const good = { id: 'a', name: 'A', url: 'https://example.test/a.ics' };
    expect(
      cleanFeeds([
        good,
        { ...good },
        null,
        'x',
        { id: 'b', name: 'B', url: 'http://example.test/b.ics' },
        { id: '', name: 'C', url: good.url },
        { id: 'd', name: 4, url: good.url },
      ]),
    ).toEqual([good]);
    expect(cleanFeeds('nope')).toEqual([]);
    expect(cleanFeeds(undefined)).toEqual([]);
  });
});
