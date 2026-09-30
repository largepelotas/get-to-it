import type { Item } from '@/data/types';
import { buildTree, flatten, type FlatRow } from './tree';

export interface TodoModel {
  /** Open top-level tasks with their subtasks, in list order. */
  open: FlatRow[];
  /** Finished top-level tasks with their subtasks, newest first. */
  done: FlatRow[];
  /** How many top-level tasks are finished. */
  doneCount: number;
}

/**
 * The rows of a to-do list. Finished subtasks stay under their parent; a
 * finished top-level task moves to the Completed section with its subtasks.
 */
export function todoModel(items: Record<string, Item>, listId: string): TodoModel {
  const live = Object.values(items).filter((i) => i.listId === listId && !i.deletedAt);
  const tree = buildTree(live);
  const open = tree.filter((n) => !n.item.checked);
  const done = tree
    .filter((n) => n.item.checked)
    .sort((a, b) => (b.item.completedAt ?? 0) - (a.item.completedAt ?? 0));
  return { open: flatten(open), done: flatten(done), doneCount: done.length };
}

/** The row index just past `index` and its visible subtasks. */
export function endOfSubtree(rows: FlatRow[], index: number): number {
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) end++;
  return end;
}
