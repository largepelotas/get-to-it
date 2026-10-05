import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, IconButton, Input } from '@/components/ui';
import type { CalendarFeed } from '@/data/types';
import { formatTime, toTimeString } from '@/lib/dates';
import { normalizeFeedUrl } from '@/lib/feedLinks';
import { newId } from '@/lib/id';
import { setSetting, useData } from '@/store/data';
import { refreshFeeds, removeFeed, useFeeds, type FeedState } from '@/store/feeds';

const DEFAULT_NAME = 'Calendar';

function statusText(state: FeedState | undefined): string {
  if (!state || state.status === 'idle') return 'Not updated yet';
  if (state.status === 'loading') return 'Updating…';
  if (state.status === 'error') return state.error ?? 'The calendar couldn’t be updated.';
  return state.fetchedAt
    ? `Updated ${formatTime(toTimeString(new Date(state.fetchedAt)))}`
    : 'Updated';
}

function FeedRow({ feed }: { feed: CalendarFeed }) {
  const state = useFeeds((s) => s.feeds[feed.id]);
  const failed = state?.status === 'error';
  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{feed.name}</p>
        {/* The link is never shown again: anyone who sees it can read the calendar. */}
        <p role="status" className={failed ? 'text-xs text-danger' : 'text-xs text-fg-subtle'}>
          {statusText(state)}
        </p>
      </div>
      <IconButton
        size="sm"
        label={`Remove ${feed.name}`}
        tooltip={false}
        icon={<X className="size-3.5" />}
        onClick={() => removeFeed(feed.id)}
      />
    </li>
  );
}

/** Calendar links whose events show read-only beside tasks. */
export function CalendarsSection() {
  const feeds = useData((s) => s.settings.calendarFeeds);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizeFeedUrl(link);
    if (!url) {
      setError('Paste a link that starts with https:// or webcal://.');
      return;
    }
    const feed: CalendarFeed = { id: newId(), name: name.trim() || DEFAULT_NAME, url };
    setSetting('calendarFeeds', [...feeds, feed]);
    setName('');
    setLink('');
    setError(null);
    void refreshFeeds();
  };

  return (
    <>
      <p className="text-xs text-fg-subtle">
        Events from a calendar link are shown read-only beside your tasks. The app only goes online
        to fetch these links. In Outlook: Settings &gt; Calendar &gt; Shared calendars &gt; Publish
        a calendar, then copy the ICS link.
      </p>
      {feeds.length > 0 && (
        <ul aria-label="Calendars" className="space-y-2">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} />
          ))}
        </ul>
      )}
      {feeds.length > 0 && <Button onClick={() => void refreshFeeds()}>Refresh now</Button>}
      <form onSubmit={add} className="space-y-2" aria-label="Add a calendar">
        <div className="flex items-center gap-3">
          <label htmlFor="settings-calendar-name" className="w-14 shrink-0 text-sm text-fg">
            Name
          </label>
          <Input
            id="settings-calendar-name"
            value={name}
            placeholder={DEFAULT_NAME}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="settings-calendar-link" className="w-14 shrink-0 text-sm text-fg">
            Link
          </label>
          <Input
            id="settings-calendar-link"
            value={link}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'settings-calendar-error' : undefined}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
          />
        </div>
        {error && (
          <p id="settings-calendar-error" role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <Button type="submit">Add calendar</Button>
      </form>
    </>
  );
}
