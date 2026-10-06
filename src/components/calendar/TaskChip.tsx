import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';
import { Repeat, Timer } from 'lucide-react';
import { describeRow } from '@/components/items/describeRow';
import { PRIORITY_COLOR } from '@/components/items/priority';
import { formatShortTime, formatTime } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import type { DueRow } from '@/store/smart';
import { openDetails, selectItem } from '@/store/ui';
import {
  blockText,
  TASK_FILL,
  TASK_FILL_HOVER,
  TASK_FILL_SELECTED,
  type ChipPlacement,
} from './chipLayout';

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
 * A task on a calendar day. Clicking opens its details; the whole chip can be
 * dragged to another day. `placement` says where it is drawn: in a month cell
 * (the short time, then the name, wrapping to two lines), in the all-day row
 * (one line) or as a block on a time grid (positioned by `block`, the short
 * start time then the name, wrapping as far as the block is tall).
 */
export function TaskChip({
  row,
  selected,
  hasReminder,
  focusing,
  placement = 'month',
  block,
  inPopover,
  onOpen,
}: {
  row: DueRow;
  selected: boolean;
  hasReminder: boolean;
  focusing: boolean;
  placement?: ChipPlacement;
  /** Where the block sits; needed when `placement` is 'block'. */
  block?: BlockPlace;
  /** Shown in a day's "+N more" pop-up: not draggable (the cell's own chip is). */
  inPopover?: boolean;
  /** Runs after the details open. */
  onOpen?: () => void;
}) {
  const { item } = row;
  const { setNodeRef, isDragging, attributes, listeners } = useDraggable({
    id: inPopover ? `popover:${item.id}` : item.id,
    disabled: inPopover,
  });
  const time = chipTime(row);
  const shown = item.dueTime && placement !== 'allDay' ? formatShortTime(item.dueTime) : null;
  const priority = PRIORITY_COLOR[item.priority];
  const inBlock = placement === 'block' && block;
  const text = inBlock ? blockText(block.height, false) : null;
  const icons = (
    <>
      {item.recurrence && <Repeat aria-hidden className="mt-0.5 size-3 shrink-0 text-fg-muted" />}
      {focusing && <Timer aria-hidden className="mt-0.5 size-3 shrink-0 text-accent" />}
    </>
  );
  return (
    <li
      className={inBlock ? 'absolute' : undefined}
      style={
        inBlock
          ? { top: block.top, height: block.height, left: block.left, width: block.width }
          : undefined
      }
    >
      <button
        ref={setNodeRef}
        type="button"
        {...(inPopover ? {} : attributes)}
        {...(inPopover ? {} : listeners)}
        title={time ?? undefined}
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
          onOpen?.();
        }}
        style={{ borderLeftColor: priority ? colorVar(priority) : 'transparent' }}
        className={clsx(
          'flex w-full cursor-pointer items-start gap-1 rounded-sm border-l-2 px-1.5 text-left text-xs transition-colors',
          inBlock ? 'h-full overflow-hidden text-fg' : 'py-0.5',
          text?.padded && 'py-0.5',
          selected ? TASK_FILL_SELECTED : [TASK_FILL, TASK_FILL_HOVER],
          isDragging && 'opacity-50',
        )}
      >
        <span
          className={clsx(
            'min-w-0 flex-1',
            placement === 'allDay' && 'truncate',
            placement === 'month' && 'line-clamp-2',
          )}
          style={text?.style}
        >
          {shown && (
            <span aria-hidden className="text-fg-muted">
              {shown}{' '}
            </span>
          )}
          {item.text}
        </span>
        {icons}
      </button>
    </li>
  );
}
