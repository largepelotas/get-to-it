import type { Item, Section } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { buildTree, flatten, type FlatRow } from './tree';

export interface SectionRows {
  section: Section;
  /** The section's open top-level tasks with their subtasks, in list order. */
  rows: FlatRow[];
  /** How many open top-level tasks the section holds. */
  openCount: number;
}

export interface TodoModel {
  /** Open top-level tasks with their subtasks, in list order, whatever section they are in. */
  open: FlatRow[];
  /** The open rows that sit in no section (including tasks whose section is missing). */
  unsectioned: FlatRow[];
  /** The list's sections in order, each with its open rows. Empty if the list has none. */
  sections: SectionRows[];
  /** Finished top-level tasks with their subtasks, newest first. */
  done: FlatRow[];
  /** How many top-level tasks are finished. */
  doneCount: number;
}

/**
 * The rows of a to-do list. Finished subtasks stay under their parent; a
 * finished top-level task moves to the Completed section with its subtasks.
 */
export function todoModel(
  items: Record<string, Item>,
  listId: string,
  sectionRows: Record<string, Section> = {},
): TodoModel {
  const live = Object.values(items).filter((i) => i.listId === listId && !i.deletedAt);
  const tree = buildTree(live);
  const open = tree.filter((n) => !n.item.checked);
  const ordered = Object.values(sectionRows)
    .filter((s) => s.listId === listId)
    .sort(bySortKey);
  const known = new Set(ordered.map((s) => s.id));
  // A task naming a missing section, or a subtask shown at the top level, counts as unsectioned.
  const inSection = (n: (typeof open)[number], id: string) =>
    n.item.sectionId === id && !n.item.parentId;
  const unsectioned = open.filter(
    (n) => !n.item.sectionId || !known.has(n.item.sectionId) || !!n.item.parentId,
  );
  const sections = ordered.map((section) => {
    const nodes = open.filter((n) => inSection(n, section.id));
    return { section, rows: flatten(nodes), openCount: nodes.length };
  });
  const done = tree
    .filter((n) => n.item.checked)
    .sort((a, b) => (b.item.completedAt ?? 0) - (a.item.completedAt ?? 0));
  return {
    open: flatten(open),
    unsectioned: flatten(unsectioned),
    sections,
    done: flatten(done),
    doneCount: done.length,
  };
}

/** The row index just past `index` and its visible subtasks. */
export function endOfSubtree(rows: FlatRow[], index: number): number {
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) end++;
  return end;
}
