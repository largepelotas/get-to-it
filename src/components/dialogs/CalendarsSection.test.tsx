import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, useData } from '@/store/data';
import { eventsByDay, resetFeedsForTests } from '@/store/feeds';
import { CalendarsSection } from './CalendarsSection';

const { fetchCalendarFeed } = vi.hoisted(() => ({ fetchCalendarFeed: vi.fn() }));
vi.mock('@/platform', () => ({ fetchCalendarFeed }));

// An invented calendar: one event, dated relative to today so it is always inside the window.
function feedText() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:t1',
    `DTSTART:${day}T093000`,
    'SUMMARY:Planning',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

beforeEach(() => {
  resetForTests(new MemoryRepository());
  resetFeedsForTests();
  fetchCalendarFeed.mockReset();
});

describe('CalendarsSection', () => {
  it('adds a calendar, shows its status, and removes it', async () => {
    fetchCalendarFeed.mockResolvedValue(feedText());
    render(<CalendarsSection />);
    await userEvent.type(screen.getByLabelText('Link'), 'webcal://example.test/cal.ics');
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));

    // Named "Calendar" by default, and the link is stored as https.
    expect(useData.getState().settings.calendarFeeds).toEqual([
      expect.objectContaining({ name: 'Calendar', url: 'https://example.test/cal.ics' }),
    ]);
    expect(await screen.findByText(/^Updated /)).toBeInTheDocument();
    expect(fetchCalendarFeed).toHaveBeenCalledTimes(1);
    expect(eventsByDay().size).toBe(1);
    // The link isn't shown again.
    expect(screen.queryByText(/example\.test/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Calendar' }));
    expect(useData.getState().settings.calendarFeeds).toEqual([]);
    expect(eventsByDay().size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Refresh now' })).toBeNull();
  });

  // Bug prevented: a mistyped link is saved and then fails silently on every refresh.
  it('refuses a link that is not https or webcal, and says so', async () => {
    render(<CalendarsSection />);
    await userEvent.type(screen.getByLabelText('Link'), 'http://example.test/cal.ics');
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\/ or webcal:\/\//);
    expect(useData.getState().settings.calendarFeeds).toEqual([]);
    expect(fetchCalendarFeed).not.toHaveBeenCalled();
  });

  it('shows the error when a refresh fails, and refreshes on request', async () => {
    fetchCalendarFeed.mockRejectedValueOnce('Couldn’t reach the calendar.');
    render(<CalendarsSection />);
    await userEvent.type(screen.getByLabelText('Name'), 'Work');
    await userEvent.type(screen.getByLabelText('Link'), 'https://example.test/cal.ics');
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    expect(await screen.findByText('Couldn’t reach the calendar.')).toBeInTheDocument();

    fetchCalendarFeed.mockResolvedValue(feedText());
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(screen.getByText(/^Updated /)).toBeInTheDocument());
    expect(screen.getByText('Work')).toBeInTheDocument();
  });
});
