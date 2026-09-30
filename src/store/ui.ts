import { create } from 'zustand';
import type { ListType } from '@/data/types';

export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'list'; listId: string }
  | { kind: 'archive' }
  | { kind: 'trash' };

export type DialogState =
  | { kind: 'newList'; folderId: string | null; type?: ListType }
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
  dialog: DialogState | null;
  /** The sidebar row showing an inline rename field. */
  renaming: Renaming | null;
}

export const useUI = create<UIState>(() => ({
  view: { kind: 'today' },
  selectedItemId: null,
  dialog: null,
  renaming: null,
}));

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind !== 'list' || a.listId === (b as typeof a).listId);
}

export function navigate(view: View): void {
  if (sameView(useUI.getState().view, view)) return;
  useUI.setState({ view, selectedItemId: null });
}

export const openList = (listId: string) => navigate({ kind: 'list', listId });

export function selectItem(id: string | null): void {
  useUI.setState({ selectedItemId: id });
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
