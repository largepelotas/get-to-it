import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, setSetting } from '@/store/data';
import { resetFeedsForTests } from '@/store/feeds';
import { useCalendarFeeds } from './useCalendarFeeds';

const { fetchCalendarFeed } = vi.hoisted(() => ({ fetchCalendarFeed: vi.fn() }));
vi.mock('@/platform', () => ({ fetchCalendarFeed }));
// The real parser loads from disk on first use, which fake timers can't wait for.
vi.mock('@/lib/ics', () => ({ parseFeed: () => Promise.resolve([]) }));

const FEED = { id: 'A', name: 'Alpha', url: 'https://example.test/a.ics' };
const CALENDAR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';

beforeEach(() => {
  vi.useFakeTimers();
  resetForTests(new MemoryRepository());
  resetFeedsForTests();
  fetchCalendarFeed.mockReset();
  fetchCalendarFeed.mockResolvedValue(CALENDAR);
});
afterEach(() => vi.useRealTimers());

describe('useCalendarFeeds', () => {
  // Bug prevented: an app with no calendar links still going online.
  it('fetches nothing when there are no feeds', async () => {
    renderHook(() => useCalendarFeeds());
    await act(() => vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000));
    expect(fetchCalendarFeed).not.toHaveBeenCalled();
  });

  it('refreshes shortly after start, then every half hour', async () => {
    setSetting('calendarFeeds', [FEED]);
    renderHook(() => useCalendarFeeds());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetchCalendarFeed).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(fetchCalendarFeed).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000));
    expect(fetchCalendarFeed).toHaveBeenCalledTimes(2);
  });

  it('refreshes when a feed is added later, without waiting for the interval', async () => {
    renderHook(() => useCalendarFeeds());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    act(() => setSetting('calendarFeeds', [FEED]));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(fetchCalendarFeed).toHaveBeenCalledTimes(1);
  });
});
