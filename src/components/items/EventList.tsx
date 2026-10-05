import { CalendarClock } from 'lucide-react';
import { formatTimeRange } from '@/lib/dates';
import type { FeedEvent } from '@/store/feeds';

/**
 * A day's events from calendar links, above its tasks: time (or "All day"),
 * title and calendar name. Read-only, and not part of the task list's
 * selection or keyboard navigation.
 */
export function EventList({ events }: { events: FeedEvent[] }) {
  return (
    <ul aria-label="Events" className="pt-1">
      {events.map((event) => (
        <li
          key={`${event.feedId}:${event.id}`}
          title={event.location ?? undefined}
          className="flex min-h-8 items-center gap-2 px-2 text-sm text-fg"
        >
          <CalendarClock aria-hidden className="size-4 shrink-0 text-fg-muted" />
          <span className="w-28 shrink-0 truncate text-fg-muted">
            {event.startTime ? formatTimeRange(event.startTime, event.endTime) : 'All day'}
          </span>
          <span className="min-w-0 flex-1 truncate">{event.title}</span>
          <span className="shrink-0 truncate text-xs text-fg-subtle">{event.feedName}</span>
        </li>
      ))}
    </ul>
  );
}
