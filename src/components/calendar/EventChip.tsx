import clsx from 'clsx';
import { useState } from 'react';
import { Popover } from '@/components/ui/Popover';
import { formatLongDate, formatShortTime, formatTimeRange } from '@/lib/dates';
import type { FeedEvent } from '@/store/feeds';
import { blockText, EVENT_FILL, EVENT_FILL_HOVER, type ChipPlacement } from './chipLayout';
import type { BlockPlace } from './TaskChip';

/** "9:00 am–10:00 am", or "all day". */
function eventTimeText(event: FeedEvent): string {
  return event.startTime ? formatTimeRange(event.startTime, event.endTime) : 'all day';
}

/**
 * An event from a calendar link on a calendar day. Read-only: it can't be
 * dragged, checked, selected or edited. Clicking opens a small pop-up with its
 * details. `placement` says where it is drawn: in a month cell (a dot, the
 * short start time, then the title, wrapping to two lines), in the all-day row
 * (a dot and the title on one line) or as a block on a time grid (positioned
 * by `block`, with a dashed outline; the short start time then the title).
 */
export function EventChip({
  event,
  placement = 'month',
  block,
}: {
  event: FeedEvent;
  placement?: ChipPlacement;
  /** Where the block sits; needed when `placement` is 'block'. */
  block?: BlockPlace;
}) {
  const [open, setOpen] = useState(false);
  const time = eventTimeText(event);
  const hoverTime = event.startTime ? formatTimeRange(event.startTime, event.endTime) : 'All day';
  const full = event.location ? `${hoverTime}, ${event.location}` : hoverTime;
  const inBlock = placement === 'block' && block;
  const text = inBlock ? blockText(block.height, true) : null;
  return (
    <li
      className={inBlock ? 'absolute' : undefined}
      style={
        inBlock
          ? { top: block.top, height: block.height, left: block.left, width: block.width }
          : undefined
      }
    >
      <Popover
        open={open}
        onOpenChange={setOpen}
        label={event.title}
        className="w-72"
        trigger={
          <button
            type="button"
            aria-label={`${event.title}, ${time}, ${event.feedName}`}
            title={full}
            data-event-id={event.id}
            className={clsx(
              'flex w-full cursor-pointer items-start gap-1 rounded-sm px-1.5 text-left text-xs text-fg',
              inBlock
                ? 'h-full overflow-hidden border border-dashed border-line-strong bg-elevated'
                : clsx('py-0.5 transition-colors', EVENT_FILL, EVENT_FILL_HOVER),
              text?.padded && 'py-0.5',
            )}
          >
            {placement !== 'block' && (
              <span aria-hidden className="mt-[5px] size-1.5 shrink-0 rounded-full bg-fg-muted" />
            )}
            <span
              aria-hidden
              className={clsx(
                'min-w-0 flex-1',
                placement === 'allDay' && 'truncate',
                placement === 'month' && 'line-clamp-2',
              )}
              style={text?.style}
            >
              {event.startTime && placement !== 'allDay' && (
                <span className="text-fg-muted">{formatShortTime(event.startTime)} </span>
              )}
              {event.title}
            </span>
          </button>
        }
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-fg">{event.title}</h2>
          <p className="text-fg-muted">
            {formatLongDate(event.date)}
            {', '}
            {event.startTime ? formatTimeRange(event.startTime, event.endTime) : 'All day'}
          </p>
          {event.location && <p className="text-fg">{event.location}</p>}
          <p className="text-xs text-fg-muted">{event.feedName}</p>
        </div>
      </Popover>
    </li>
  );
}
