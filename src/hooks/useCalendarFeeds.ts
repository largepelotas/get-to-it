import { useEffect, useState } from 'react';
import { useData } from '@/store/data';
import { refreshFeeds } from '@/store/feeds';
import { useToday } from './useToday';

/** Wait after launch so the first fetch doesn't compete with startup. */
const FIRST_REFRESH_MS = 3000;
const REFRESH_EVERY_MS = 30 * 60 * 1000;

/**
 * Keeps calendar events fresh: shortly after start, every half hour, when the
 * list of links changes, and when the day rolls over. Does nothing, and sets no
 * timers, when there are no links. Failures are shown in Settings, not as toasts.
 */
export function useCalendarFeeds(): void {
  const feeds = useData((s) => s.settings.calendarFeeds);
  const today = useToday();
  const hasFeeds = feeds.length > 0;
  // Changes when a link is added or removed, but not when something else in settings does.
  const signature = feeds.map((f) => `${f.id}\n${f.url}`).join('\n\n');
  const [mountedAt] = useState(() => Date.now());

  // Runs at start, when the links change and when the day rolls over.
  useEffect(() => {
    if (!hasFeeds) return;
    const wait = Math.max(0, FIRST_REFRESH_MS - (Date.now() - mountedAt));
    const timer = setTimeout(() => void refreshFeeds(), wait);
    return () => clearTimeout(timer);
  }, [hasFeeds, signature, today, mountedAt]);

  useEffect(() => {
    if (!hasFeeds) return;
    const every = setInterval(() => void refreshFeeds(), REFRESH_EVERY_MS);
    return () => clearInterval(every);
  }, [hasFeeds]);
}
