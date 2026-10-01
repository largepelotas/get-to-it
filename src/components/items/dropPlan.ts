import type { Section } from '@/data/types';
import { endOfSubtree } from '@/store/todo';
import { projectDrop, type FlatRow } from '@/store/tree';
import { INDENT } from './ItemRow';

/** Headings share the drag and keyboard id space with tasks, behind this prefix. */
export const SECTION_PREFIX = 'section:';
export const sectionKey = (id: string) => SECTION_PREFIX + id;
export const isSectionKey = (id: string) => id.startsWith(SECTION_PREFIX);

/** The id of the drop zone for "no section", shown at the top of a sectioned list during a drag. */
export const NO_SECTION_ID = 'zone:no-section';

/** The tasks that sit under one heading (or, with no section, above the first). */
export interface Group {
  /** The section's id; null for the tasks in no section. */
  id: string | null;
  section: Section | null;
  /** Every open row in the group, in order. */
  rows: FlatRow[];
  /** The rows on screen: none while the section is collapsed. */
  shown: FlatRow[];
  count: number;
}

export interface DropPlan {
  parentId: string | null;
  afterId: string | null;
  /** The section a top-level drop lands in. */
  sectionId: string | null;
  depth: number;
}

/**
 * Where a dragged task lands when it is over `overId`: a task (in any group) or a section
 * heading. A drop on an open heading goes to the start of that section, on a collapsed one to
 * its end. A drop on a task in another group counts as dropping it after that task.
 */
export function planDrop(
  groups: Group[],
  activeId: string,
  overId: string,
  offsetX: number,
): DropPlan | null {
  const from = groups.findIndex((g) => g.rows.some((r) => r.item.id === activeId));
  if (from < 0) return null;
  // The "No section" zone: the start of the unsectioned group, even if it is empty.
  if (overId === NO_SECTION_ID) return { parentId: null, afterId: null, sectionId: null, depth: 0 };
  if (isSectionKey(overId)) {
    const target = groups.find((g) => g.section && sectionKey(g.section.id) === overId);
    if (!target?.section) return null;
    const last = target.section.collapsed
      ? target.rows.filter((r) => r.depth === 0 && r.item.id !== activeId).pop()
      : undefined;
    return {
      parentId: null,
      afterId: last?.item.id ?? null,
      sectionId: target.section.id,
      depth: 0,
    };
  }
  const to = groups.findIndex((g) => g.rows.some((r) => r.item.id === overId));
  if (to < 0) return null;
  let rows = groups[to].rows;
  if (to !== from) {
    // Borrow the dragged task and its subtasks so the drop can be worked out inside the group.
    const source = groups[from].rows;
    const start = source.findIndex((r) => r.item.id === activeId);
    rows = [...source.slice(start, endOfSubtree(source, start)), ...rows];
  }
  const target = projectDrop(rows, activeId, overId, offsetX, INDENT);
  if (!target) return null;
  return {
    parentId: target.parentId,
    afterId: target.afterId,
    sectionId: groups[to].id,
    depth: target.depth,
  };
}
