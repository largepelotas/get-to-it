import { toast } from 'sonner';
import { createFolder, deleteFolder } from './store/actions/folders';
import {
  archiveList,
  deleteList,
  duplicateList,
  unarchiveList,
  restoreList,
  setShowCompleted,
} from './store/actions/lists';
import type { Priority } from './data/types';
import { formatDateKey, formatDue, formatTimestamp } from './lib/dates';
import type { ReminderEntry, SnoozeChoice } from './lib/reminders';
import { copyText, notify, requestNotificationPermission } from './platform';
import { clearChecked, uncheckAll } from './store/actions/grocery';
import {
  createItemFromText,
  createItemsFromLines,
  deleteItems,
  duplicateItem,
  moveDueDates,
  moveItemToList,
  moveItemsToList,
  setChecked,
  setCheckedMany,
  setDueDates,
  setItemCollapsed,
  setPriorities,
  setWontDo,
  skipOccurrence,
  withoutDescendants,
} from './store/actions/items';
import {
  addReminder,
  dismissReminders,
  snoozeReminder,
  type ReminderSpec,
} from './store/actions/reminders';
import { deleteListForever, emptyTrash } from './store/actions/trash';
import { lastEntryId, redo, setSetting, undo, undoEntry, useData } from './store/data';
import { listToMarkdown } from './store/markdown';
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

const tasks = (n: number) => (n === 1 ? '1 task' : `${n} tasks`);

/** Runs a change and says whether it recorded an undo step (a no-op leaves nothing to undo). */
function recorded(run: () => void): boolean {
  const before = lastEntryId();
  run();
  return lastEntryId() !== before;
}

/** The ids that still exist and aren't in the Trash. */
function liveIds(ids: string[]): string[] {
  const { items } = useData.getState().tables;
  return ids.filter((id) => items[id] && !items[id].deletedAt);
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

/** Copies a list or note to the clipboard as Markdown. */
export async function copyAsMarkdown(id: string): Promise<void> {
  const { tables, settings } = useData.getState();
  const list = tables.lists[id];
  if (!list) return;
  try {
    await copyText(listToMarkdown(tables, list, settings.groceryCategories));
    toast(`Copied ${quote(list.title)} as Markdown`, { duration: 2000 });
  } catch (err) {
    console.error('Copying failed', err);
    toast.error('Couldn’t copy to the clipboard');
  }
}

/**
 * Opens an item's list with the item selected and in view: collapsed parents
 * are expanded, and a finished item's section is shown. To-do items also get
 * the details panel.
 */
export function revealItem(id: string): void {
  const { items, lists } = useData.getState().tables;
  const item = items[id];
  const list = item && lists[item.listId];
  if (!item || !list) return;
  let top = item;
  for (let parent = items[item.parentId ?? '']; parent; parent = items[parent.parentId ?? '']) {
    if (parent.collapsed) setItemCollapsed(parent.id, false);
    top = parent;
  }
  if (list.type === 'grocery' ? item.checked : top.checked) {
    if (!list.showCompleted) setShowCompleted(list.id, true);
  }
  openList(list.id);
  useUI.setState({ selectedItemId: id, detailsOpen: list.type === 'todo', reveal: id });
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
  // A subtask selected with its parent goes with the parent, so it isn't counted twice.
  const live = withoutDescendants((id) => items[id], liveIds(ids));
  if (!live.length) return;
  deleteItems(live);
  toastWithUndo(
    live.length === 1 ? `Deleted ${quote(items[live[0]].text)}` : `Deleted ${live.length} tasks`,
  );
}

/** Moves a task to another to-do list, with an Undo toast. */
export function moveTaskToList(id: string, listId: string): void {
  const { items, lists } = useData.getState().tables;
  const list = lists[listId];
  if (!items[id] || !list || items[id].listId === listId) return;
  moveItemToList(id, listId);
  if (useData.getState().tables.items[id]?.listId !== listId) return;
  // In a list view the task is no longer there, so nothing in it stays selected.
  const { view, selectedItemId } = useUI.getState();
  const selected = selectedItemId ? useData.getState().tables.items[selectedItemId] : undefined;
  if (view.kind === 'list' && selected && selected.listId !== view.listId) {
    useUI.setState({ selectedItemId: null, detailsOpen: false, duePickerFor: null });
  }
  toastWithUndo(`Moved to ${list.title}`);
}

/**
 * Moves tasks to another to-do list, with one Undo toast. One task goes as
 * `moveTaskToList` does; a task selected along with its parent goes with the parent.
 */
export function moveTasksToList(ids: string[], listId: string): void {
  const { items, lists } = useData.getState().tables;
  const list = lists[listId];
  if (!list) return;
  const moving = withoutDescendants((id) => items[id], liveIds(ids)).filter(
    (id) => items[id].listId !== listId,
  );
  if (moving.length <= 1) return moving.length ? moveTaskToList(moving[0], listId) : undefined;
  if (!recorded(() => moveItemsToList(moving, listId))) return;
  // In a list view the moved tasks are no longer there, so nothing in them stays selected.
  const { view, selectedItemId } = useUI.getState();
  const selected = selectedItemId ? useData.getState().tables.items[selectedItemId] : undefined;
  if (view.kind === 'list' && selected && selected.listId !== view.listId) {
    useUI.setState({ selectedItemId: null, detailsOpen: false, duePickerFor: null });
  }
  toastWithUndo(`Moved ${moving.length} tasks to ${list.title}`);
}

/** Completes the tasks, or reopens them if they are all done already. One undo step, one toast. */
export function toggleItems(ids: string[]): void {
  const live = liveIds(ids);
  const { items } = useData.getState().tables;
  if (live.length <= 1) {
    if (live.length) toggleItem(live[0], !items[live[0]].checked, { announce: true });
    return;
  }
  const allDone = live.every((id) => items[id].checked);
  const target = !allDone;
  // Only tasks that change count (and a subtask selected with its parent goes with the parent).
  const changing = (target ? withoutDescendants((id) => items[id], live) : live).filter(
    (id) => items[id].checked !== target,
  );
  if (!changing.length || !recorded(() => setCheckedMany(changing, target))) return;
  // A selected subtask that was ticked along with its parent counts too.
  const after = useData.getState().tables.items;
  const withParent = live.filter(
    (id) => !changing.includes(id) && !items[id].checked && after[id]?.checked,
  );
  const count = changing.length + (target ? withParent.length : 0);
  toastWithUndo(allDone ? `Marked ${tasks(count)} not done` : `Completed ${tasks(count)}`);
}

/** Sets the priority of tasks. Several at once get one Undo toast. */
export function setTasksPriority(ids: string[], priority: Priority): void {
  const { items } = useData.getState().tables;
  const live = liveIds(ids).filter((id) => items[id].priority !== priority);
  if (!live.length || !recorded(() => setPriorities(live, priority))) return;
  if (ids.length > 1) toastWithUndo(`Priority set on ${tasks(live.length)}`);
}

/** Sets (or, with `null`, clears) the due date of tasks, keeping their times. One Undo toast. */
export function setTasksDue(ids: string[], date: string | null): void {
  const { items } = useData.getState().tables;
  const live = liveIds(ids).filter((id) => items[id].dueDate !== date);
  if (!live.length || !recorded(() => setDueDates(live, date))) return;
  toastWithUndo(
    date === null
      ? `Cleared the date on ${tasks(live.length)}`
      : `Rescheduled ${tasks(live.length)}`,
  );
}

/** Today's "Reschedule": moves overdue tasks to a day, keeping their times. */
export function rescheduleTasks(ids: string[], date: string): void {
  const { items } = useData.getState().tables;
  const live = liveIds(ids).filter((id) => items[id].dueDate !== date);
  if (!live.length || !recorded(() => moveDueDates(live, date))) return;
  toastWithUndo(`Rescheduled ${tasks(live.length)}`);
}

/**
 * Toasts after quick add, and asks for notification permission if a reminder
 * was set. Stays quiet when the tasks went to `fieldListId`, the list the
 * field belongs to, unless `announce` is set (the dialog always confirms).
 */
function afterQuickAdd(ids: string[], fieldListId: string, announce: boolean): void {
  const { items, lists, reminders } = useData.getState().tables;
  const made = ids.filter((id) => items[id]);
  if (!made.length) return;
  if (Object.values(reminders).some((r) => made.includes(r.itemId))) {
    void requestNotificationPermission();
  }
  const destinations = [...new Set(made.map((id) => items[id].listId))];
  if (!announce && destinations.every((id) => id === fieldListId)) return;
  const where = destinations.length === 1 ? lists[destinations[0]]?.title : undefined;
  const what = made.length === 1 ? 'Added' : `Added ${made.length} tasks`;
  toastWithUndo(where ? `${what} to ${where}` : what);
}

/** Adds a task from quick-add text; a `#List` in it may file it elsewhere, which a toast says. */
export function quickAddTask(
  listId: string,
  raw: string,
  { defaultDue = null, announce = false }: { defaultDue?: string | null; announce?: boolean } = {},
): boolean {
  const id = createItemFromText(listId, raw, {}, defaultDue);
  if (!id) return false;
  afterQuickAdd([id], listId, announce);
  return true;
}

/** Adds one task per pasted line, as one undo step. */
export function quickAddLines(
  listId: string,
  lines: string[],
  { defaultDue = null, announce = false }: { defaultDue?: string | null; announce?: boolean } = {},
): boolean {
  const ids = createItemsFromLines(listId, lines, defaultDue);
  if (!ids.length) return false;
  afterQuickAdd(ids, listId, announce);
  return true;
}

/** Copies a task and its subtasks, and selects the copy. */
export function duplicateTask(id: string): void {
  const copy = duplicateItem(id);
  // Whichever list is open (a list, Today or Upcoming) focuses the row and clears `reveal`.
  if (copy) useUI.setState({ selectedItemId: copy, reveal: copy });
}

/** Skips one occurrence of a repeating task. */
export function skipTask(id: string): void {
  const item = useData.getState().tables.items[id];
  const next = skipOccurrence(id);
  if (item && next) toast(`Skipped to ${formatDue(next, item.dueTime)}`, { duration: 3000 });
}

/** Closes a task without doing it. */
export function closeAsWontDo(id: string): void {
  setWontDo(id);
}

const itemCount = (n: number) => (n === 1 ? '1 item' : `${n} items`);

/** Grocery "Uncheck all": everything in the cart goes back on the list. */
export function uncheckCart(listId: string): void {
  const count = uncheckAll(listId);
  if (count) toastWithUndo(`Put ${itemCount(count)} back on the list`);
}

/** Grocery "Clear checked": removes what's in the cart, with Undo. */
export function clearCart(listId: string): void {
  const count = clearChecked(listId);
  if (count) toastWithUndo(`Cleared ${itemCount(count)} from the cart`);
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

/**
 * Hides or shows the sidebar. If focus was on what's about to disappear (the
 * sidebar, or the Show sidebar button), it moves to the other one.
 */
export function toggleSidebar(): void {
  const hide = !useData.getState().settings.sidebarHidden;
  const active = document.activeElement;
  // Focus only moves when the thing holding it is about to go away.
  const lost = hide
    ? !!active?.closest('[data-region="sidebar"]')
    : !!active?.closest('[data-show-sidebar]');
  setSetting('sidebarHidden', hide);
  if (!lost) return;
  setTimeout(() => {
    const target = hide
      ? document.querySelector<HTMLElement>('[data-show-sidebar]')
      : document.querySelector<HTMLElement>('[data-region="sidebar"] [aria-current]');
    target?.focus();
  }, 0);
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
