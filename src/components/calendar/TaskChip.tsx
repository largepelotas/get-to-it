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

/**
 * A task on a calendar day: one line with its time and name. Clicking opens
 * its details; the whole chip can be dragged to another day.
 */
export function TaskChip({
  row,
  selected,
  hasReminder,
  focusing,
}: {
  row: DueRow;
  selected: boolean;
  hasReminder: boolean;
  focusing: boolean;
}) {
  const { item } = row;
  const { setNodeRef, isDragging, attributes, listeners } = useDraggable({ id: item.id });
  const time = chipTime(row);
  const priority = PRIORITY_COLOR[item.priority];
  return (
    <li>
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
          'flex w-full cursor-pointer items-center gap-1 rounded-sm border-l-2 px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-hover',
          selected ? 'bg-selected' : 'bg-elevated',
          isDragging && 'opacity-50',
        )}
      >
        {time && (
          <span aria-hidden className="shrink-0 text-fg-muted">
            {time}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.text}</span>
        {item.recurrence && <Repeat aria-hidden className="size-3 shrink-0 text-fg-muted" />}
        {focusing && <Timer aria-hidden className="size-3 shrink-0 text-accent" />}
      </button>
    </li>
  );
}
