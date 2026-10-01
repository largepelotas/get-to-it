import type { List } from '@/data/types';
import { formatDateKey, formatDue, formatTime, isOverdue, todayKey } from '@/lib/dates';
import { describeRecurrence } from '@/lib/recurrence';
import type { FlatRow } from '@/store/tree';
import { PRIORITY_LABEL } from './priority';

/** The list (and parent task) of a row shown outside its list, in Today and Upcoming. */
export interface RowOrigin {
  list: List;
  parentText?: string;
}

export const originTitle = (origin: RowOrigin) =>
  origin.parentText ? `${origin.list.title} › ${origin.parentText}` : origin.list.title;

/**
 * What a screen reader says after the task's name: everything the icons and
 * small text on the row show, in words.
 */
export function describeRow(
  row: FlatRow,
  { hasReminder = false, origin }: { hasReminder?: boolean; origin?: RowOrigin } = {},
): string {
  const { item, childCount, doneCount } = row;
  const parts: string[] = [];
  if (item.checked) parts.push(item.wontDo ? "Won't do" : 'Completed');
  if (item.dueDate) {
    const overdue = !item.checked && isOverdue(item.dueDate, item.dueTime);
    // Said as words, so a screen reader doesn't read out a dash.
    const day = formatDue(item.dueDate, null);
    const time = item.dueTime
      ? ` ${formatTime(item.dueTime)}${item.endTime ? ` to ${formatTime(item.endTime)}` : ''}`
      : '';
    parts.push(`Due ${day}${time}${overdue ? ', overdue' : ''}`);
  }
  if (item.deadline) {
    const passed = !item.checked && item.deadline < todayKey();
    parts.push(`Deadline ${formatDateKey(item.deadline)}${passed ? ', passed' : ''}`);
  }
  if (item.recurrence) {
    const rule = describeRecurrence(item.recurrence, item.dueDate);
    parts.push(`Repeats ${rule.charAt(0).toLowerCase()}${rule.slice(1)}`);
  }
  if (item.priority > 0) parts.push(PRIORITY_LABEL[item.priority]);
  if (hasReminder) parts.push('Reminder set');
  if (childCount > 0) {
    parts.push(`${doneCount} of ${childCount} subtasks done${item.collapsed ? ', hidden' : ''}`);
  }
  if (item.details) parts.push('Has notes');
  if (origin) parts.push(`In ${originTitle(origin)}`);
  return parts.join('. ');
}
