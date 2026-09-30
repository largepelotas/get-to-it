import { toast } from 'sonner';
import { createFolder, deleteFolder } from './store/actions/folders';
import {
  archiveList,
  deleteList,
  duplicateList,
  unarchiveList,
  restoreList,
} from './store/actions/lists';
import { formatDateKey, formatTimestamp } from './lib/dates';
import type { ReminderEntry, SnoozeChoice } from './lib/reminders';
import { notify, requestNotificationPermission } from './platform';
import { deleteItems, setChecked } from './store/actions/items';
import {
  addReminder,
  dismissReminders,
  snoozeReminder,
  type ReminderSpec,
} from './store/actions/reminders';
import { deleteListForever, emptyTrash } from './store/actions/trash';
import { lastEntryId, redo, undo, undoEntry, useData } from './store/data';
import { confirmAction, navigate, openList, startRename, useUI, type View } from './store/ui';

/*
 * User-facing commands: store actions plus the navigation and toasts that go
 * with them. Menus, buttons and shortcuts call these.
 */

const quote = (title: string) => `“${title}”`;

function isLive(listId: string | null | undefined): boolean {
  const list = listId ? useData.getState().tables.lists[listId] : undefined;
  return !!list && !list.deletedAt && !list.archivedAt;
}

/** Where to go when the current list goes away: the default list, or Today. */
export function homeView(): View {
  const { defaultListId } = useData.getState().settings;
  return defaultListId && isLive(defaultListId)
    ? { kind: 'list', listId: defaultListId }
    : { kind: 'today' };
}

function leaveList(id: string): void {
  const { view } = useUI.getState();
  if (view.kind === 'list' && view.listId === id) navigate(homeView());
}

/** A toast whose Undo button reverts exactly the action that was just taken. */
function toastWithUndo(message: string): void {
  const entry = lastEntryId();
  toast(message, {
    action:
      entry === null
        ? undefined
        : {
            label: 'Undo',
            onClick: () => {
              if (!undoEntry(entry))
                toast('Other changes have been made since, so use Undo instead.');
            },
          },
  });
}

export function trashList(id: string): void {
  const list = useData.getState().tables.lists[id];
  if (!list) return;
  deleteList(id);
  leaveList(id);
  toastWithUndo(`Moved ${quote(list.title)} to the Trash`);
}

export function archive(id: string): void {
  const list = useData.getState().tables.lists[id];
  if (!list) return;
  archiveList(id);
  leaveList(id);
  toastWithUndo(`Archived ${quote(list.title)}`);
}

export function unarchive(id: string): void {
  unarchiveList(id);
}

export function restore(id: string): void {
  const list = useData.getState().tables.lists[id];
  if (!list) return;
  restoreList(id);
  toast(`Restored ${quote(list.title)}`, {
    action: { label: 'Open', onClick: () => openList(id) },
  });
}

export function duplicate(id: string): void {
  const copy = duplicateList(id);
  if (copy) openList(copy);
}

export function newFolder(): void {
  const id = createFolder('New folder');
  startRename({ kind: 'folder', id });
}

export function removeFolder(id: string): void {
  const folder = useData.getState().tables.folders[id];
  if (!folder) return;
  deleteFolder(id);
  toastWithUndo(`Deleted folder ${quote(folder.name)}`);
}

export function deleteForever(id: string): void {
  const list = useData.getState().tables.lists[id];
  if (!list) return;
  confirmAction({
    title: `Delete ${quote(list.title)} forever?`,
    message: 'The list and everything in it will be removed. This can’t be undone.',
    confirmLabel: 'Delete forever',
    danger: true,
    onConfirm: () => {
      leaveList(id);
      deleteListForever(id);
      // Undo buttons on earlier toasts may point at history that's now gone.
      toast.dismiss();
    },
  });
}

export function confirmEmptyTrash(): void {
  const count = Object.values(useData.getState().tables.lists).filter((l) => l.deletedAt).length;
  confirmAction({
    title: 'Empty the Trash?',
    message: `${count === 1 ? '1 list and everything in it' : `${count} lists and everything in them`} will be removed. This can’t be undone.`,
    confirmLabel: 'Empty Trash',
    danger: true,
    onConfirm: () => {
      const { view } = useUI.getState();
      if (view.kind === 'list' && useData.getState().tables.lists[view.listId]?.deletedAt) {
        navigate({ kind: 'trash' });
      }
      emptyTrash();
      toast.dismiss();
    },
  });
}

/** Deletes tasks (with their subtasks) and offers Undo. */
export function trashItems(ids: string[]): void {
  const { items } = useData.getState().tables;
  const live = ids.filter((id) => items[id] && !items[id].deletedAt);
  if (!live.length) return;
  deleteItems(live);
  toastWithUndo(
    live.length === 1 ? `Deleted ${quote(items[live[0]].text)}` : `Deleted ${live.length} tasks`,
  );
}

/** "tomorrow", "on Friday", "on Fri, Oct 9". */
function dueOn(date: string): string {
  const label = formatDateKey(date);
  return label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : `on ${label}`;
}

/**
 * Checks or unchecks a task. A repeating task moves to its next date, which
 * a toast announces. `announce` also confirms ordinary completions, for views
 * the task disappears from (Today, Upcoming).
 */
export function toggleItem(id: string, checked: boolean, { announce = false } = {}): void {
  const item = useData.getState().tables.items[id];
  if (!item) return;
  const next = setChecked(id, checked);
  if (next) toastWithUndo(`${quote(item.text)} is next due ${dueOn(next)}`);
  else if (checked && announce) toastWithUndo(`Completed ${quote(item.text)}`);
}

export function undoCommand(): void {
  const label = undo();
  if (label) toast(`Undid ${label.toLowerCase()}`, { duration: 2000 });
}

export function redoCommand(): void {
  const label = redo();
  if (label) toast(`Redid ${label.toLowerCase()}`, { duration: 2000 });
}

/** Adds a reminder, asking for notification permission the first time. */
export function remind(itemId: string, spec: ReminderSpec): void {
  if (addReminder(itemId, spec)) void requestNotificationPermission();
}

export function snooze(reminderId: string, choice: SnoozeChoice): void {
  const until = snoozeReminder(reminderId, choice);
  toast(`Snoozed until ${formatTimestamp(until).replace(/^Today /, '')}`, { duration: 2500 });
}

export function dismiss(reminderIds: string[]): void {
  dismissReminders(reminderIds);
}

/** Completes the task a reminder is for, and clears the reminder. */
export function completeFromReminder(reminderId: string, itemId: string): void {
  dismissReminders([reminderId]);
  toggleItem(itemId, true, { announce: true });
}

/** Tells the user about reminders that passed while the app was closed. */
export function announceMissed(entries: ReminderEntry[]): void {
  const title = entries.length === 1 ? 'Missed reminder' : `You missed ${entries.length} reminders`;
  const body =
    entries.length === 1
      ? entries[0].item.text
      : entries
          .slice(0, 3)
          .map((e) => e.item.text)
          .join(', ') + (entries.length > 3 ? '…' : '');
  toast(title, {
    description: body,
    duration: 10_000,
    action: { label: 'Show', onClick: () => navigate({ kind: 'reminders' }) },
  });
  void notify(title, body);
}
