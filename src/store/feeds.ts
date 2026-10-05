import { useMemo } from 'react';
import { create } from 'zustand';
import type { CalendarFeed } from '@/data/types';
import { addDaysKey, todayKey, type DateKey } from '@/lib/dates';
import { parseFeed, type ExternalEvent } from '@/lib/ics';
import { fetchCalendarFeed } from '@/platform';
import { setSetting, useData } from './data';

/*
 * Events from calendar links. Nothing here is saved, undoable or exported: it
 * is what the last refresh found, and it is empty after a restart until the
 * first refresh. The links themselves live in `settings.calendarFeeds`.
 */

export type { ExternalEvent };

/** An event with the feed it came from. `feedName` is filled in when the events are read. */
export type FeedEvent = ExternalEvent & { feedId: string; feedName: string };

export interface FeedState {
  /** From the last good refresh; kept when a later one fails. */
  events: ExternalEvent[];
  status: 'idle' | 'loading' | 'ok' | 'error';
  /** Plain English, never the link. */
  error: string | null;
  fetchedAt: number | null;
}

const IDLE: FeedState = { events: [], status: 'idle', error: null, fetchedAt: null };

/** How far around today events are read. */
export const DAYS_BACK = 60;
export const DAYS_AHEAD = 365;

export const useFeeds = create<{ feeds: Record<string, FeedState> }>(() => ({ feeds: {} }));

export function resetFeedsForTests(): void {
  useFeeds.setState({ feeds: {} });
  latest.clear();
  running.clear();
}

function patch(id: string, change: Partial<FeedState>): void {
  useFeeds.setState((s) => ({
    feeds: { ...s.feeds, [id]: { ...(s.feeds[id] ?? IDLE), ...change } },
  }));
}

/** The newest request per feed, so a slow answer to an old one can't overwrite a newer one. */
const latest = new Map<string, number>();
let requestNumber = 0;

/** Refreshes in progress, so asking twice at once (the Settings button and the hook) fetches once. */
const running = new Map<string, Promise<void>>();

function refreshOne(
  feed: CalendarFeed,
  fetchText: (url: string) => Promise<string>,
  from: DateKey,
  to: DateKey,
): Promise<void> {
  const key = `${feed.id}
${feed.url}`;
  const already = running.get(key);
  if (already) return already;
  const promise = fetchOne(feed, fetchText, from, to).finally(() => running.delete(key));
  running.set(key, promise);
  return promise;
}

async function fetchOne(
  feed: CalendarFeed,
  fetchText: (url: string) => Promise<string>,
  from: DateKey,
  to: DateKey,
): Promise<void> {
  const mine = ++requestNumber;
  latest.set(feed.id, mine);
  patch(feed.id, { status: 'loading' });
  try {
    const events = await parseFeed(await fetchText(feed.url), from, to);
    if (latest.get(feed.id) !== mine) return;
    patch(feed.id, { events, status: 'ok', error: null, fetchedAt: Date.now() });
  } catch (err) {
    if (latest.get(feed.id) !== mine) return;
    // Errors from the platform layer and the parser are already plain English and carry no link.
    const message = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
    patch(feed.id, { status: 'error', error: message || 'The calendar couldn’t be updated.' });
  }
}

/**
 * Fetches every calendar link in settings. One failing doesn't affect the
 * others, and a failed refresh keeps the events from the last good one.
 * Feeds that have been removed are dropped.
 */
export async function refreshFeeds(
  fetchText: (url: string) => Promise<string> = fetchCalendarFeed,
  today: DateKey = todayKey(),
): Promise<void> {
  const feeds = useData.getState().settings.calendarFeeds;
  const ids = new Set(feeds.map((f) => f.id));
  useFeeds.setState((s) => ({
    feeds: Object.fromEntries(Object.entries(s.feeds).filter(([id]) => ids.has(id))),
  }));
  for (const id of [...latest.keys()]) if (!ids.has(id)) latest.delete(id);
  const from = addDaysKey(today, -DAYS_BACK);
  const to = addDaysKey(today, DAYS_AHEAD);
  await Promise.all(feeds.map((feed) => refreshOne(feed, fetchText, from, to)));
}

/** Removes a calendar link and drops its events at once. */
export function removeFeed(id: string): void {
  setSetting(
    'calendarFeeds',
    useData.getState().settings.calendarFeeds.filter((f) => f.id !== id),
  );
  latest.delete(id);
  useFeeds.setState((s) => {
    const { [id]: _gone, ...rest } = s.feeds;
    return { feeds: rest };
  });
}

function startOf(e: ExternalEvent): number {
  return e.startTime === null ? -1 : Number(e.startTime.replace(':', ''));
}

/** Events of the feeds that are still in settings, by day: all day first, then by start time. */
export function groupEventsByDay(
  feeds: Record<string, FeedState>,
  list: CalendarFeed[],
): Map<DateKey, FeedEvent[]> {
  const byDay = new Map<DateKey, FeedEvent[]>();
  for (const feed of list) {
    for (const event of feeds[feed.id]?.events ?? []) {
      const entry: FeedEvent = { ...event, feedId: feed.id, feedName: feed.name };
      const day = byDay.get(event.date);
      if (day) day.push(entry);
      else byDay.set(event.date, [entry]);
    }
  }
  for (const day of byDay.values()) {
    day.sort((a, b) => startOf(a) - startOf(b) || a.title.localeCompare(b.title));
  }
  return byDay;
}

/** The selector: all events by day, as of now. */
export function eventsByDay(): Map<DateKey, FeedEvent[]> {
  return groupEventsByDay(useFeeds.getState().feeds, useData.getState().settings.calendarFeeds);
}

/** `eventsByDay` for components: recomputed only when the events or the feeds change. */
export function useEventsByDay(): Map<DateKey, FeedEvent[]> {
  const feeds = useFeeds((s) => s.feeds);
  const list = useData((s) => s.settings.calendarFeeds);
  return useMemo(() => groupEventsByDay(feeds, list), [feeds, list]);
}
