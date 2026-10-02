import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';
import { Repeat, Timer } from 'lucide-react';
import { describeRow } from '@/components/items/describeRow';
import { PRIORITY_COLOR } from '@/components/items/priority';
import { formatTime } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import type { DueRow } from '@/store/smart';
import { openDetails, selectItem } from '@/store/ui';

/** "9:00 am" or "9:00 am–10:30 am", or null for an all-day task. */
function chipTime(row: DueRow): string | null {
  const { dueTime, endTime } = row.item;
  if (!dueTime) return null;
  return endTime ? `${formatTime(dueTime)}–${formatTime(endTime)}` : formatTime(dueTime);
}

/** Where a task is drawn on a time grid: CSS offsets inside its day's column. */
export interface BlockPlace {
  top: number;
  height: number;
  left: string;
  width: string;
}

/**
 * A task on a calendar day: one line with its time and name. Clicking opens
 * its details; the whole chip can be dragged to another day. With `block` it
 * is drawn on a time grid instead: positioned in its column, the time range
 * on the first line and the name below.
 */
export function TaskChip({
  row,
  selected,
  hasReminder,
  focusing,
  block,
}: {
  row: DueRow;
  selected: boolean;
  hasReminder: boolean;
  focusing: boolean;
  block?: BlockPlace;
}) {
  const { item } = row;
  const { setNodeRef, isDragging, attributes, listeners } = useDraggable({ id: item.id });
  const time = chipTime(row);
  const priority = PRIORITY_COLOR[item.priority];
  return (
    <li
      className={block ? 'absolute' : undefined}
      style={
        block
          ? { top: block.top, height: block.height, left: block.left, width: block.width }
          : undefined
      }
    >
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        // dnd-kit points this at keyboard-drag instructions, which would hide the description below
        // (and there is no keyboard sensor here to follow them).
        aria-describedby={undefined}
        aria-description={describeRow(row, {
          hasReminder,
          focusing,
          origin: { list: row.list, parentText: row.parent?.text },
        })}
        onClick={() => {
          selectItem(item.id);
          openDetails(item.id);
        }}
        style={{ borderLeftColor: priority ? colorVar(priority) : 'transparent' }}
        className={clsx(
          'flex w-full cursor-pointer rounded-sm border-l-2 px-1.5 text-left text-xs transition-colors hover:bg-hover',
          block
            ? 'h-full flex-col items-start gap-0 overflow-hidden py-0.5 text-fg'
            : 'items-center gap-1 py-0.5',
          selected ? 'bg-selected' : block ? 'bg-accent-soft' : 'bg-elevated',
          isDragging && 'opacity-50',
        )}
      >
        {time && (
          <span aria-hidden className="max-w-full shrink-0 truncate text-fg-muted">
            {time}
          </span>
        )}
        <span className={clsx('min-w-0 truncate', block ? 'w-full' : 'flex-1')}>{item.text}</span>
        {item.recurrence && <Repeat aria-hidden className="size-3 shrink-0 text-fg-muted" />}
        {focusing && <Timer aria-hidden className="size-3 shrink-0 text-accent" />}
      </button>
    </li>
  );
}
