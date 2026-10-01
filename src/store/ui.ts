import { create } from 'zustand';
import type { ListType } from '@/data/types';

export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'reminders' }
  | { kind: 'list'; listId: string }
  | { kind: 'archive' }
  | { kind: 'trash' };

export type DialogState =
  | { kind: 'newList'; folderId: string | null; type?: ListType }
  | { kind: 'quickAdd' }
  | { kind: 'settings' }
  | { kind: 'palette' }
  | { kind: 'shortcuts' }
  | { kind: 'moveTasks'; ids: string[] }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => void;
    };

export interface Renaming {
  kind: 'list' | 'folder';
  id: string;
  /** Renaming the copy of a list in the Pinned section. */
  pinned?: boolean;
}

interface UIState {
  view: View;
  /** The selected item in the current list (details panel, keyboard actions). */
  selectedItemId: string | null;
  /**
   * Every selected task while two or more are selected (in the order the view
   * shows them), else empty. `selectedItemId` stays the focused one of them.
   */
  multiSelectedIds: string[];
  /** Where a Shift+click or Shift+arrow range starts. */
  selectionAnchor: string | null;
  /** The selection bar's Date popover is open. */
  selectionDateOpen: boolean;
  /** Show the details panel for the selected item. */
  detailsOpen: boolean;
  /** The item whose due-date picker is open in the details panel. */
  duePickerFor: string | null;
  dialog: DialogState | null;
  /** The sidebar row showing an inline rename field. */
  renaming: Renaming | null;
  /** An item for its list to scroll to and focus once shown (opened from search). */
  reveal: string | null;
}

export const useUI = create<UIState>(() => ({
  view: { kind: 'today' },
  selectedItemId: null,
  multiSelectedIds: [],
  selectionAnchor: null,
  selectionDateOpen: false,
  detailsOpen: false,
  duePickerFor: null,
  dialog: null,
  renaming: null,
  reveal: null,
}));

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind !== 'list' || a.listId === (b as typeof a).listId);
}

export function navigate(view: View): void {
  if (sameView(useUI.getState().view, view)) return;
  useUI.setState({
    view,
    selectedItemId: null,
    multiSelectedIds: [],
    selectionAnchor: null,
    selectionDateOpen: false,
    detailsOpen: false,
    duePickerFor: null,
  });
}

export const openList = (listId: string) => navigate({ kind: 'list', listId });

/** Selects one task (and drops any group), making it the start of the next range. */
export function selectItem(id: string | null): void {
  const { selectedItemId, multiSelectedIds, selectionAnchor } = useUI.getState();
  if (selectedItemId === id && !multiSelectedIds.length && selectionAnchor === id) return;
  useUI.setState({ selectedItemId: id, multiSelectedIds: [], selectionAnchor: id });
}

/**
 * A row took keyboard focus. Inside a group that only moves the focus; a row
 * outside it (or one being edited) becomes the single selection.
 */
export function focusItem(id: string, editing: boolean): void {
  const { multiSelectedIds } = useUI.getState();
  if (!editing && multiSelectedIds.includes(id)) {
    if (useUI.getState().selectedItemId !== id) useUI.setState({ selectedItemId: id });
  } else selectItem(id);
}

/** Every selected task: the group, or the one selected task. */
export function selectedIds(): string[] {
  const { multiSelectedIds, selectedItemId } = useUI.getState();
  if (multiSelectedIds.length) return multiSelectedIds;
  return selectedItemId ? [selectedItemId] : [];
}

/** Keeps `ids` as the selection if there are two or more of them, else just selects the one. */
function setGroup(ids: string[], primary: string, anchor: string | null): void {
  if (ids.length >= 2) {
    useUI.setState({ multiSelectedIds: ids, selectedItemId: primary, selectionAnchor: anchor });
  } else {
    useUI.setState({
      multiSelectedIds: [],
      selectedItemId: ids[0] ?? primary,
      selectionAnchor: anchor,
    });
  }
}

/** Ctrl/Cmd+click: adds the task to the group, or takes it out. `visibleIds` is the view's order. */
export function toggleSelected(id: string, visibleIds: string[]): void {
  const { multiSelectedIds, selectedItemId } = useUI.getState();
  const current = new Set(
    multiSelectedIds.length ? multiSelectedIds : selectedItemId ? [selectedItemId] : [],
  );
  const adding = !current.has(id);
  if (adding) current.add(id);
  else current.delete(id);
  const next = visibleIds.filter((v) => current.has(v));
  const primary = adding
    ? id
    : selectedItemId && next.includes(selectedItemId)
      ? selectedItemId
      : (next[next.length - 1] ?? id);
  setGroup(next, primary, id);
}

/** Shift+click or Shift+arrow: everything from the anchor to `toId`. */
export function selectRange(toId: string, visibleIds: string[]): void {
  const { selectionAnchor, selectedItemId } = useUI.getState();
  const start = [selectionAnchor, selectedItemId].find((v) => v && visibleIds.includes(v)) ?? toId;
  const a = visibleIds.indexOf(start);
  const b = visibleIds.indexOf(toId);
  if (a < 0 || b < 0) return selectItem(toId);
  setGroup(visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1), toId, start);
}

/** Mod+A. */
export function selectAll(visibleIds: string[]): void {
  const { selectedItemId, selectionAnchor } = useUI.getState();
  const primary =
    selectedItemId && visibleIds.includes(selectedItemId) ? selectedItemId : visibleIds[0];
  if (!primary) return;
  setGroup(visibleIds, primary, selectionAnchor ?? primary);
}

/** Back to the focused task alone. */
export function clearMultiSelection(): void {
  if (useUI.getState().multiSelectedIds.length) {
    useUI.setState({ multiSelectedIds: [], selectionAnchor: useUI.getState().selectedItemId });
  }
}

/** Forgets selected tasks that are no longer in the view. */
export function dropMissingSelection(visibleIds: string[]): void {
  const { multiSelectedIds, selectedItemId, selectionAnchor } = useUI.getState();
  if (!multiSelectedIds.length) return;
  const shown = new Set(visibleIds);
  const kept = multiSelectedIds.filter((id) => shown.has(id));
  if (kept.length === multiSelectedIds.length) return;
  if (kept.length >= 2) {
    const primary = selectedItemId && kept.includes(selectedItemId) ? selectedItemId : kept[0];
    useUI.setState({ multiSelectedIds: kept, selectedItemId: primary });
  } else {
    // Down to one or none: an ordinary selection. With none left, the focused task
    // stays selected until focus moves to a row that is still shown.
    useUI.setState({
      multiSelectedIds: [],
      selectedItemId: kept[0] ?? selectedItemId,
      selectionAnchor: kept[0] ?? selectionAnchor,
    });
  }
}

export function setSelectionDateOpen(open: boolean): void {
  useUI.setState({ selectionDateOpen: open });
}

/** Selects an item and shows its details. */
export function openDetails(id: string): void {
  useUI.setState({ selectedItemId: id, detailsOpen: true });
}

export function closeDetails(): void {
  useUI.setState({ detailsOpen: false, duePickerFor: null });
}

/** Opens the details panel with the due-date picker showing. */
export function pickDueDate(id: string): void {
  useUI.setState({ selectedItemId: id, detailsOpen: true, duePickerFor: id });
}

export function setDuePickerFor(id: string | null): void {
  useUI.setState({ duePickerFor: id });
}

export function clearReveal(): void {
  useUI.setState({ reveal: null });
}

export function openDialog(dialog: DialogState): void {
  useUI.setState({ dialog });
}

export function closeDialog(): void {
  useUI.setState({ dialog: null });
}

/** Opens a confirmation dialog; `onConfirm` runs if the user agrees. */
export function confirmAction(options: Omit<Extract<DialogState, { kind: 'confirm' }>, 'kind'>) {
  openDialog({ kind: 'confirm', ...options });
}

export function startRename(renaming: Renaming): void {
  useUI.setState({ renaming });
}

export function stopRename(): void {
  useUI.setState({ renaming: null });
}
