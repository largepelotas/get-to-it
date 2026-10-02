import type { Item } from '@/data/types';
import { bySortKey } from '@/lib/order';

export interface TreeNode {
  item: Item;
  children: TreeNode[];
}

export interface FlatRow {
  item: Item;
  depth: number;
  childCount: number;
  doneCount: number;
}

/** Deepest subtask level (0 = top level). */
export const MAX_DEPTH = 3;

/** Children by parent id (null for top level), each sorted by sort key. */
export function childrenIndex(items: Item[]): Map<string | null, Item[]> {
  const ids = new Set(items.map((i) => i.id));
  const index = new Map<string | null, Item[]>();
  for (const item of items) {
    // Subtasks whose parent is gone are shown at the top level.
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const bucket = index.get(parent);
    if (bucket) bucket.push(item);
    else index.set(parent, [item]);
  }
  for (const bucket of index.values()) bucket.sort(bySortKey);
  return index;
}

export function buildTree(items: Item[]): TreeNode[] {
  const index = childrenIndex(items);
  const build = (parent: string | null): TreeNode[] =>
    (index.get(parent) ?? []).map((item) => ({ item, children: build(item.id) }));
  return build(null);
}

export function countDone(node: TreeNode): { total: number; done: number } {
  return {
    total: node.children.length,
    done: node.children.filter((c) => c.item.checked).length,
  };
}

/** Depth-first rows, skipping the subtasks of collapsed items unless `showCollapsed`. */
export function flatten(
  nodes: TreeNode[],
  depth = 0,
  out: FlatRow[] = [],
  showCollapsed = false,
): FlatRow[] {
  for (const node of nodes) {
    const { total, done } = countDone(node);
    out.push({ item: node.item, depth, childCount: total, doneCount: done });
    if (showCollapsed || !node.item.collapsed)
      flatten(node.children, depth + 1, out, showCollapsed);
  }
  return out;
}

/** Every descendant id of `id`, from a children index. */
export function descendantIds(index: Map<string | null, Item[]>, id: string): string[] {
  const out: string[] = [];
  // Guards against a loop of parents, which would otherwise never end.
  const seen = new Set([id]);
  const walk = (parent: string) => {
    for (const child of index.get(parent) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** How many levels of subtasks sit under `id` (0 if none). */
export function subtreeHeight(index: Map<string | null, Item[]>, id: string): number {
  const children = index.get(id) ?? [];
  return children.length ? 1 + Math.max(...children.map((c) => subtreeHeight(index, c.id))) : 0;
}

export function depthOf(byId: Map<string, Item>, item: Item): number {
  let depth = 0;
  let parent = item.parentId ? byId.get(item.parentId) : undefined;
  while (parent && depth < 50) {
    depth++;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return depth;
}

export interface DropTarget {
  parentId: string | null;
  /** Index among the new parent's children, not counting the dragged item. */
  index: number;
  /** The sibling it lands after, or null when it becomes the first child. */
  afterId: string | null;
  depth: number;
}

/**
 * Where a dragged row lands in a flattened tree. Horizontal drag distance
 * picks the depth, bounded by the rows around the drop point: at most one
 * level deeper than the row above, and no shallower than the row below.
 * This follows dnd-kit's sortable tree example.
 */
export function projectDrop(
  rows: FlatRow[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentWidth: number,
  maxDepth = MAX_DEPTH,
): DropTarget | null {
  const activeIndex = rows.findIndex((r) => r.item.id === activeId);
  const overIndex = rows.findIndex((r) => r.item.id === overId);
  if (activeIndex < 0 || overIndex < 0) return null;
  const active = rows[activeIndex];

  // The dragged row's own subtree moves with it, so drop those rows.
  const subtree = new Set<string>();
  for (let i = activeIndex + 1; i < rows.length && rows[i].depth > active.depth; i++) {
    subtree.add(rows[i].item.id);
  }
  if (subtree.has(overId)) return null;
  const others = rows.filter((r) => r.item.id !== activeId && !subtree.has(r.item.id));
  const heightBelow = Math.max(
    0,
    ...rows.filter((r) => subtree.has(r.item.id)).map((r) => r.depth - active.depth),
  );

  // Position in `others` where the dragged row now sits.
  let insertAt = others.findIndex((r) => r.item.id === overId);
  if (overIndex > activeIndex) insertAt += 1;
  const prev = others[insertAt - 1];
  const next = others[insertAt];

  const dragDepth = active.depth + Math.round(offsetX / indentWidth);
  const maxAllowed = Math.min(prev ? prev.depth + 1 : 0, maxDepth - heightBelow);
  const minAllowed = next ? next.depth : 0;
  const depth = Math.max(0, Math.min(Math.max(dragDepth, minAllowed), maxAllowed));

  // The parent is the nearest row above at depth - 1.
  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = insertAt - 1; i >= 0; i--) {
      if (others[i].depth === depth - 1) {
        parentId = others[i].item.id;
        break;
      }
    }
  }

  // Count earlier siblings under that parent to get the index. A row's parent
  // is the last row seen one level up.
  let index = 0;
  let afterId: string | null = null;
  const lastAtDepth: string[] = [];
  for (let i = 0; i < insertAt; i++) {
    const row = others[i];
    lastAtDepth[row.depth] = row.item.id;
    const rowParent = row.depth > 0 ? (lastAtDepth[row.depth - 1] ?? null) : null;
    if (row.depth === depth && rowParent === parentId) {
      index++;
      afterId = row.item.id;
    }
  }
  return { parentId, index, afterId, depth };
}
