import clsx from 'clsx';
import { CalendarClock } from 'lucide-react';
import { formatTimeRange } from '@/lib/dates';
import type { FeedEvent } from '@/store/feeds';
import type { BlockPlace } from './TaskChip';

/** "9:00 am–10:00 am", or "all day". */
function eventTimeText(event: FeedEvent): string {
  return event.startTime ? formatTimeRange(event.startTime, event.endTime) : 'all day';
}

/**
 * An event from a calendar link on a calendar day. Read-only: it can't be
 * dragged, checked, selected or opened, and looks different from a task: a
 * dashed outline and a calendar icon. With `block` it is drawn on a time grid.
 */
export function EventChip({ event, block }: { event: FeedEvent; block?: BlockPlace }) {
  const time = eventTimeText(event);
  return (
    <li
      className={block ? 'absolute' : undefined}
      style={
        block
          ? { top: block.top, height: block.height, left: block.left, width: block.width }
          : undefined
      }
    >
      <div
        role="group"
        aria-label={`${event.title}, ${time}, ${event.feedName}`}
        title={event.location ?? undefined}
        data-event-id={event.id}
        className={clsx(
          'flex w-full rounded-sm border border-dashed border-line-strong bg-elevated px-1.5 text-xs text-fg',
          block
            ? 'h-full flex-col items-start gap-0 overflow-hidden py-0.5'
            : 'items-center gap-1 py-0.5',
        )}
      >
        <span aria-hidden className="flex w-full min-w-0 items-center gap-1">
          <CalendarClock className="size-3 shrink-0 text-fg-muted" />
          {event.startTime && <span className="shrink-0 truncate text-fg-muted">{time}</span>}
          {!block && <span className="min-w-0 flex-1 truncate">{event.title}</span>}
        </span>
        {block && (
          <span aria-hidden className="w-full truncate">
            {event.title}
          </span>
        )}
      </div>
    </li>
  );
}
