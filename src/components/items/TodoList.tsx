import {
  closestCenter,
  DndContext,
  MeasuringStrategy,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { ChevronRight, PanelRight } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { addSection, removeSection, toggleItem, trashItems } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import type { MenuEntries } from '@/components/ui';
import { EmptyState } from '@/components/views/ViewHeader';
import type { List } from '@/data/types';
import { SHORTCUTS } from '@/lib/keymap';
import { matchesShortcut } from '@/lib/shortcuts';
import { useItemsWithReminders } from '@/hooks/useReminders';
import { isMac } from '@/platform';
import {
  createItemFromText,
  deleteItems,
  indentItem,
  moveItem,
  moveItemBy,
  outdentItem,
  repeatsOnCheck,
  setItemCollapsed,
} from '@/store/actions/items';
import { setShowCompleted } from '@/store/actions/lists';
import {
  moveItemsToSection,
  moveSection,
  moveSectionBy,
  renameSection,
  setSectionCollapsed,
} from '@/store/actions/sections';
import { useData } from '@/store/data';
import { endOfSubtree, todoModel } from '@/store/todo';
import { MAX_DEPTH, type FlatRow } from '@/store/tree';
import {
  clearReveal,
  closeDetails,
  dropMissingSelection,
  focusItem,
  openDetails,
  pickDueDate,
  selectItem,
  selectRange,
  setRenamingSection,
  toggleSelected,
  useUI,
} from '@/store/ui';
import { itemMenuEntries } from './itemMenu';
import { DraftRow, ItemRow, type DragBits, type RowClickKind, type RowKeyMode } from './ItemRow';
import { QuickAdd } from './QuickAdd';
import {
  isSectionKey,
  NO_SECTION_ID,
  planDrop,
  SECTION_PREFIX,
  sectionKey,
  type Group,
} from './dropPlan';
import { SectionHeading } from './SectionHeading';
import type { SectionActions } from './sectionMenu';
import { handleSelectionKey, keepFocus } from './selection';

/**
 * Where the inline new-task field sits: under `parentId`, after the sibling `after` (null = first).
 * With neither, `sectionId` says which group's start it opens at (null or absent = no section).
 */
interface Draft {
  parentId: string | null;
  after: string | null;
  sectionId?: string | null;
}

/** Something to focus after the next render. A new object each time, so repeats still apply. */
interface FocusRequest {
  target: string | 'draft' | 'quick-add';
  mode?: RowKeyMode;
  caretAtEnd?: boolean;
}

interface DragState {
  /** A task id, or `section:<id>` for a section heading. */
  activeId: string;
  overId: string;
  offsetX: number;
}

/** The parent a row is shown under (orphaned subtasks show at the top level). */
const shownParent = (row: FlatRow) => (row.depth === 0 ? null : row.item.parentId);

/** The sibling shown just above `rows[index]`, if any. */
function prevSibling(rows: FlatRow[], index: number): string | null {
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return null;
    if (rows[i].depth === depth) return rows[i].item.id;
  }
  return null;
}

/** The last direct subtask shown under `rows[index]`, if any. */
function lastChild(rows: FlatRow[], index: number): string | null {
  let last: string | null = null;
  const end = endOfSubtree(rows, index);
  for (let i = index + 1; i < end; i++) {
    if (rows[i].depth === rows[index].depth + 1) last = rows[i].item.id;
  }
  return last;
}

/** The drop target for "no section": the start of the tasks that sit above the first heading. */
function NoSectionZone({ over }: { over: boolean }) {
  const { setNodeRef } = useDroppable({ id: NO_SECTION_ID });
  return (
    <div
      ref={setNodeRef}
      data-testid="no-section-zone"
      className={clsx(
        'mb-1 flex h-8 items-center justify-center rounded-md border border-dashed text-xs',
        over ? 'border-accent bg-hover text-fg' : 'border-line-strong text-fg-muted',
      )}
    >
      No section
    </div>
  );
}

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (drag: DragBits) => ReactNode;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id,
    disabled,
  });
  return children({
    ref: setNodeRef,
    // Rows only move up and down; how far right they're dragged sets the depth instead.
    style: { transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition },
    dragging: isDragging,
    handle: { ...attributes, ...listeners, tabIndex: -1 },
  });
}

export function TodoList({ list }: { list: List }) {
  const items = useData((s) => s.tables.items);
  const sectionTable = useData((s) => s.tables.sections);
  const model = useMemo(
    () => todoModel(items, list.id, sectionTable),
    [items, list.id, sectionTable],
  );
  const selectedId = useUI((s) => s.selectedItemId);
  const multiIds = useUI((s) => s.multiSelectedIds);
  const reveal = useUI((s) => s.reveal);
  const renamingSectionId = useUI((s) => s.renamingSectionId);
  const reminded = useItemsWithReminders();
  const readOnly = !!(list.deletedAt || list.archivedAt);

  const containerRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState('');
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // The draft as of the last render, for the delayed blur check.
  const latest = useRef({ draft, draftText });
  useLayoutEffect(() => {
    latest.current = { draft, draftText };
  });

  const groups = useMemo<Group[]>(
    () => [
      {
        id: null,
        section: null,
        rows: model.unsectioned,
        shown: model.unsectioned,
        count: model.unsectioned.filter((r) => r.depth === 0).length,
      },
      ...model.sections.map(({ section, rows, openCount }) => ({
        id: section.id,
        section,
        rows,
        shown: section.collapsed ? [] : rows,
        count: openCount,
      })),
    ],
    [model],
  );
  const hasSections = model.sections.length > 0;
  const doneRows = list.showCompleted ? model.done : [];
  /** The open rows on screen, in order (a collapsed section hides its own). */
  const openShown = useMemo(() => groups.flatMap((g) => g.shown), [groups]);
  /** Every task row in order. Headings are never in it, so selection skips them. */
  const visible = [...openShown, ...doneRows];
  const visibleIndex = new Map(visible.map((r, i) => [r, i]));
  const inDone = (index: number) => index >= openShown.length;
  /** What the arrow keys step through: task ids and `section:<id>` headings. */
  const navKeys = [
    ...groups.flatMap((g) => [
      ...(g.section ? [sectionKey(g.section.id)] : []),
      ...g.shown.map((r) => r.item.id),
    ]),
    ...doneRows.map((r) => r.item.id),
  ];
  const selectionShown = visible.some((r) => r.item.id === selectedId);
  const visibleKey = visible.map((r) => r.item.id).join('|');

  // Selected tasks that leave the list (done and hidden, moved, deleted) drop out of the selection.
  useLayoutEffect(() => {
    dropMissingSelection(visibleKey ? visibleKey.split('|') : []);
  }, [visibleKey]);

  useLayoutEffect(() => {
    if (!focus) return;
    if (focus.target === 'draft') return draftRef.current?.focus();
    if (focus.target === 'quick-add') return quickAddRef.current?.focus();
    const row = containerRef.current?.querySelector<HTMLElement>(
      isSectionKey(focus.target)
        ? `[data-section-id="${focus.target.slice(SECTION_PREFIX.length)}"]`
        : `[data-item-id="${focus.target}"]`,
    );
    if (!row) return;
    if (focus.mode !== 'text') return row.focus();
    const input = row.querySelector('input');
    if (!input) return;
    input.focus();
    if (focus.caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  }, [focus]);

  // An item opened from search: bring its row into view with focus.
  useLayoutEffect(() => {
    if (!reveal) return;
    containerRef.current?.querySelector<HTMLElement>(`[data-item-id="${reveal}"]`)?.focus();
    clearReveal();
  }, [reveal]);

  const focusRow = (id: string, mode: RowKeyMode = 'row', caretAtEnd = false) => {
    selectItem(id);
    setFocus({ target: id, mode, caretAtEnd });
  };
  const focusQuickAdd = () => setFocus({ target: 'quick-add' });
  /** Focuses a task row (selecting it) or a section heading, by its navigation key. */
  const goTo = (key: string) => (isSectionKey(key) ? setFocus({ target: key }) : focusRow(key));

  // Inline new-task field.
  const openDraft = (next: Draft) => {
    setDraft(next);
    setDraftText('');
    setFocus({ target: 'draft' });
  };
  const closeDraft = () => {
    setDraft(null);
    setDraftText('');
  };
  const leaveDraft = (mode: RowKeyMode) => {
    const back = draft?.after ?? draft?.parentId;
    const section = draft?.sectionId;
    closeDraft();
    if (back) focusRow(back, mode, true);
    else if (section) setFocus({ target: sectionKey(section) });
    else focusQuickAdd();
  };

  /** Which group's rows the draft sits among, and where. */
  const draftPlace = useMemo(() => {
    if (!draft || drag) return null;
    const find = (id: string) => {
      for (const group of groups) {
        const index = group.shown.findIndex((r) => r.item.id === id);
        if (index >= 0) return { group, index };
      }
      return null;
    };
    if (draft.after) {
      const at = find(draft.after);
      if (!at) return null;
      const { group, index } = at;
      return {
        groupId: group.id,
        index: endOfSubtree(group.shown, index),
        depth: group.shown[index].depth,
      };
    }
    if (draft.parentId) {
      const at = find(draft.parentId);
      if (!at) return null;
      return {
        groupId: at.group.id,
        index: at.index + 1,
        depth: at.group.shown[at.index].depth + 1,
      };
    }
    const group = groups.find((g) => g.id === (draft.sectionId ?? null)) ?? groups[0];
    return { groupId: group.id, index: 0, depth: 0 };
  }, [draft, drag, groups]);

  const submitDraft = () => {
    if (!draft) return;
    const id = createItemFromText(list.id, draftText, draft);
    if (!id) return leaveDraft('row');
    openDraft({ parentId: draft.parentId, after: id });
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || !draft) return;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);
    const rows = openShown;
    if (is('Enter')) {
      e.preventDefault();
      submitDraft();
    } else if (is('Escape')) {
      e.preventDefault();
      leaveDraft('row');
    } else if ((is('Backspace') && !draftText) || is('ArrowUp')) {
      e.preventDefault();
      leaveDraft('text');
    } else if (is('Tab')) {
      e.preventDefault();
      const i = rows.findIndex((r) => r.item.id === draft.after);
      if (i < 0 || rows[i].depth + 1 > MAX_DEPTH) return;
      if (rows[i].item.collapsed) setItemCollapsed(rows[i].item.id, false);
      setDraft({ parentId: rows[i].item.id, after: lastChild(rows, i) });
    } else if (is('Shift+Tab')) {
      e.preventDefault();
      const i = rows.findIndex((r) => r.item.id === draft.parentId);
      if (i < 0) return;
      setDraft({ parentId: shownParent(rows[i]), after: rows[i].item.id });
    }
  };

  // Clicking away keeps what was typed. Moving the field (Enter) refocuses it, so wait a tick.
  const onDraftBlur = () => {
    const blurred = latest.current.draft;
    setTimeout(() => {
      const { draft: current, draftText: text } = latest.current;
      if (current !== blurred || document.activeElement === draftRef.current) return;
      if (current && text.trim()) createItemFromText(list.id, text, current);
      closeDraft();
    }, 0);
  };

  // Row actions.
  const toggle = (index: number) => {
    const row = visible[index];
    const repeats = repeatsOnCheck(row.item);
    toggleItem(row.item.id, !row.item.checked);
    // A top-level task changes sections, so keep the keyboard where it was.
    // A repeating one stays put with its next date.
    if (row.depth !== 0 || repeats) return;
    const end = endOfSubtree(visible, index);
    const next =
      end < visible.length && inDone(end) === inDone(index)
        ? visible[end]
        : index > 0 && inDone(index - 1) === inDone(index)
          ? visible[index - 1]
          : null;
    if (next) focusRow(next.item.id);
  };

  const addSubtask = (index: number) => {
    const row = openShown[index];
    if (row.item.collapsed) setItemCollapsed(row.item.id, false);
    openDraft({
      parentId: row.item.id,
      after: row.item.collapsed ? null : lastChild(openShown, index),
    });
  };

  /** Opens the new-task field at the end of a section, expanding it if it is collapsed. */
  const addTaskTo = (group: Group) => {
    if (!group.section) return;
    if (group.section.collapsed) setSectionCollapsed(group.section.id, false);
    const last = [...group.rows].reverse().find((r) => r.depth === 0);
    openDraft({ parentId: null, after: last?.item.id ?? null, sectionId: group.section.id });
  };

  const openDraftAfter = (index: number) => {
    if (inDone(index)) {
      const lastTop = [...openShown].reverse().find((r) => r.depth === 0);
      openDraft({ parentId: null, after: lastTop?.item.id ?? null });
    } else {
      const row = visible[index];
      openDraft({ parentId: shownParent(row), after: row.item.id });
    }
  };

  const toggleDetails = (id: string) => {
    const { detailsOpen, selectedItemId } = useUI.getState();
    if (detailsOpen && selectedItemId === id) closeDetails();
    else openDetails(id);
  };

  /** Alt+Up/Down. A task that crosses into a collapsed section opens it, so it stays on screen. */
  const moveBy = (id: string, direction: -1 | 1) => {
    moveItemBy(id, direction);
    const { items: now, sections } = useData.getState().tables;
    const sectionId = now[id]?.sectionId;
    const into = sectionId ? sections[sectionId] : undefined;
    if (into?.collapsed) setSectionCollapsed(into.id, false);
  };

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: RowKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const row = visible[index];
    const id = row.item.id;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    const handled = handleSelectionKey(e, mode, {
      id,
      ids: visible.map((r) => r.item.id),
      readOnly,
      focusRow: (target) => setFocus({ target, mode: 'row' }),
      toggleOne: () => toggle(index),
      addAtTop: () => openDraft({ parentId: null, after: null, sectionId: null }),
    });
    if (handled) return;

    if (is(SHORTCUTS.dueDate) && !readOnly) {
      e.preventDefault();
      pickDueDate(id);
    } else if (is(SHORTCUTS.details)) {
      e.preventDefault();
      toggleDetails(id);
    } else if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = navKeys[navKeys.indexOf(id) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next && isSectionKey(next)) setFocus({ target: next });
      else if (next) focusRow(next, mode, true);
      else if (e.key === 'ArrowUp' && !readOnly) focusQuickAdd();
    } else if (is('Escape')) {
      e.preventDefault();
      if (mode === 'text') focusRow(id, 'row');
      else if (useUI.getState().detailsOpen) closeDetails();
      else {
        selectItem(null);
        containerRef.current?.focus();
      }
    } else if (mode === 'row' && is('Enter')) {
      e.preventDefault();
      focusRow(id, 'text', true);
    } else if (readOnly) {
      return;
    } else if (is('Alt+ArrowUp') || is('Alt+ArrowDown')) {
      e.preventDefault();
      moveBy(id, e.key === 'ArrowUp' ? -1 : 1);
      focusRow(id, mode);
    } else if (is('Tab') || is('Shift+Tab')) {
      e.preventDefault();
      if (e.shiftKey) outdentItem(id);
      else indentItem(id);
      focusRow(id, mode);
    } else if (mode === 'text') {
      if (is('Enter')) {
        e.preventDefault();
        openDraftAfter(index);
      } else if (is('Mod+Enter')) {
        e.preventDefault();
        toggle(index);
      } else if (
        is('Backspace') &&
        (e.target as HTMLInputElement).value === '' &&
        row.childCount === 0
      ) {
        // Clearing a task's text and pressing Backspace removes it, like in an outliner.
        // Tasks with subtasks need Delete, which offers Undo.
        e.preventDefault();
        const neighbour = visible[index - 1] ?? visible[endOfSubtree(visible, index)];
        deleteItems([id]);
        if (neighbour) focusRow(neighbour.item.id, 'text', true);
        else focusQuickAdd();
      }
    } else if (is(' ') || is('Mod+Enter')) {
      e.preventDefault();
      toggle(index);
    } else if (is('Backspace') || is('Delete')) {
      e.preventDefault();
      const neighbour = visible[endOfSubtree(visible, index)] ?? visible[index - 1];
      trashItems([id]);
      if (neighbour) focusRow(neighbour.item.id);
      else focusQuickAdd();
    }
  };

  const menuFor = (index: number) => (): MenuEntries => {
    const row = visible[index];
    const id = row.item.id;
    if (readOnly) {
      return [
        {
          label: 'Open details',
          icon: <PanelRight className="size-3.5" />,
          onSelect: () => openDetails(id),
        },
      ];
    }
    const known = new Set(model.sections.map((s) => s.section.id));
    const current = inDone(index)
      ? row.item.sectionId && known.has(row.item.sectionId)
        ? row.item.sectionId
        : null
      : (groups.find((g) => g.rows.includes(row))?.id ?? null);
    return itemMenuEntries(row.item, {
      openDetails: () => openDetails(id),
      addSubtask: !inDone(index) && row.depth < MAX_DEPTH ? () => addSubtask(index) : undefined,
      indent: () => indentItem(id),
      outdent: () => outdentItem(id),
      moveUp: () => moveBy(id, -1),
      moveDown: () => moveBy(id, 1),
      sections: model.sections.map((s) => ({ id: s.section.id, title: s.section.title })),
      currentSectionId: current,
      moveToSection: (sectionId) => keepFocus(() => moveItemsToSection([id], sectionId)),
      remove: () => trashItems([id]),
    });
  };

  // Section headings.
  const sectionIds = model.sections.map((s) => s.section.id);
  const headingActions = (group: Group): SectionActions => {
    const id = group.id!;
    const at = sectionIds.indexOf(id);
    return {
      addTask: () => addTaskTo(group),
      rename: () => setRenamingSection(id),
      moveUp: at > 0 ? () => moveSectionBy(id, -1) : undefined,
      moveDown: at < sectionIds.length - 1 ? () => moveSectionBy(id, 1) : undefined,
      remove: () => keepFocus(() => removeSection(id)),
    };
  };

  const onHeadingKey = (e: KeyboardEvent<HTMLElement>, group: Group) => {
    const section = group.section;
    // Keys typed in the rename field or on a button inside the heading are theirs.
    if (!section || e.nativeEvent.isComposing || e.target !== e.currentTarget) return;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);
    const key = sectionKey(section.id);
    if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = navKeys[navKeys.indexOf(key) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next && isSectionKey(next)) setFocus({ target: next });
      else if (next) focusRow(next);
      else if (e.key === 'ArrowUp' && !readOnly) focusQuickAdd();
    } else if (is('ArrowLeft') || is('ArrowRight') || is(' ')) {
      e.preventDefault();
      const collapsed = is('ArrowLeft') ? true : is('ArrowRight') ? false : !section.collapsed;
      if (collapsed !== section.collapsed) setSectionCollapsed(section.id, collapsed);
    } else if (is('Escape')) {
      e.preventDefault();
      containerRef.current?.focus();
    } else if (readOnly) {
      return;
    } else if (is('Enter') || is('F2')) {
      e.preventDefault();
      setRenamingSection(section.id);
    } else if (is('Alt+ArrowUp') || is('Alt+ArrowDown')) {
      e.preventDefault();
      moveSectionBy(section.id, e.key === 'ArrowUp' ? -1 : 1);
      setFocus({ target: key });
    }
  };

  const onRenameDone = (group: Group, title: string | null) => {
    if (title !== null) return renameSection(group.id!, title);
    setRenamingSection(null);
    setFocus({ target: sectionKey(group.id!) });
  };

  // Dragging.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const draggingSection = !!drag && isSectionKey(drag.activeId);
  const projection =
    drag && !draggingSection ? planDrop(groups, drag.activeId, drag.overId, drag.offsetX) : null;
  /** The dragged task's subtasks travel with it, so they are hidden for now. */
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    if (!drag || isSectionKey(drag.activeId)) return hidden;
    const i = openShown.findIndex((r) => r.item.id === drag.activeId);
    if (i >= 0) {
      for (let j = i + 1; j < endOfSubtree(openShown, i); j++) hidden.add(openShown[j].item.id);
    }
    return hidden;
  }, [drag, openShown]);
  /** The rows to draw for a group. While a heading is dragged, only headings (and unsectioned tasks) show. */
  const rowsFor = (group: Group) =>
    draggingSection && group.section ? [] : group.shown.filter((r) => !hiddenIds.has(r.item.id));
  /** While a task is dragged in a sectioned list, a target for "no section" shows at the top. */
  const showZone = !readOnly && hasSections && !!drag && !draggingSection;
  const sortIds = groups.flatMap((g) => [
    ...(g.section ? [sectionKey(g.section.id)] : []),
    ...rowsFor(g).map((r) => r.item.id),
  ]);

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    setDrag(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (isSectionKey(activeId)) {
      if (activeId === overId) return;
      const ordered = sectionIds.map(sectionKey);
      const from = ordered.indexOf(activeId);
      // Over a heading, or over an unsectioned task (the start of the list).
      const overSection = ordered.indexOf(overId);
      const others = ordered.filter((id) => id !== activeId);
      const toIndex = isSectionKey(overId)
        ? others.indexOf(overId) + (from < overSection ? 1 : 0)
        : 0;
      if (from < 0 || toIndex === from) return;
      moveSection(activeId.slice(SECTION_PREFIX.length), toIndex);
      return;
    }
    const plan = planDrop(groups, activeId, overId, delta.x);
    const group = groups.find((g) => g.rows.some((r) => r.item.id === activeId));
    const i = group ? group.rows.findIndex((r) => r.item.id === activeId) : -1;
    if (!plan || !group || i < 0) return;
    const row = group.rows[i];
    if (
      plan.parentId === shownParent(row) &&
      plan.afterId === prevSibling(group.rows, i) &&
      (plan.parentId !== null || plan.sectionId === group.id)
    ) {
      return;
    }
    moveItem(activeId, plan.parentId, plan.afterId, plan.parentId ? undefined : plan.sectionId);
  };

  const clickRow = (id: string, kind: RowClickKind) => {
    const ids = visible.map((r) => r.item.id);
    if (kind === 'toggle') toggleSelected(id, ids);
    else if (kind === 'range') selectRange(id, ids);
    else selectItem(id);
    // Focus follows the selection: the clicked row, or one that is still selected.
    const target = useUI.getState().selectedItemId;
    if (kind !== 'plain' && target) setFocus({ target, mode: 'row' });
  };

  const renderRow = (row: FlatRow, index: number, drag?: DragBits, depth?: number) => (
    <ItemRow
      key={row.item.id}
      row={row}
      depth={depth}
      drag={drag}
      readOnly={readOnly}
      selected={row.item.id === selectedId}
      multiSelected={multiIds.includes(row.item.id)}
      hasReminder={reminded.has(row.item.id)}
      tabbable={row.item.id === selectedId || (index === 0 && !selectionShown)}
      menu={menuFor(index)}
      onSelect={(editing) => focusItem(row.item.id, editing)}
      onClickRow={(kind) => clickRow(row.item.id, kind)}
      onOpenDetails={() => openDetails(row.item.id)}
      onKeyDown={(e, mode) => onRowKey(e, index, mode)}
    />
  );

  /** The rows of one group, with the new-task field among them if it is there. */
  const rowsOf = (group: Group): ReactNode[] => {
    const nodes: ReactNode[] = rowsFor(group).map((row) => {
      const index = visibleIndex.get(row)!;
      const isActive = drag?.activeId === row.item.id;
      return (
        <SortableRow key={row.item.id} id={row.item.id} disabled={readOnly}>
          {(bits) => renderRow(row, index, bits, isActive ? projection?.depth : undefined)}
        </SortableRow>
      );
    });
    if (draftPlace && draftPlace.groupId === group.id) {
      nodes.splice(
        draftPlace.index,
        0,
        <DraftRow
          key="draft"
          depth={draftPlace.depth}
          inputRef={draftRef}
          value={draftText}
          onChange={setDraftText}
          onKeyDown={onDraftKey}
          onBlur={onDraftBlur}
        />,
      );
    }
    return nodes;
  };

  const unsectioned = rowsOf(groups[0]);
  const isEmpty = !model.open.length && !model.doneCount && !draftPlace && !hasSections;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={clsx('px-6 outline-none', multiIds.length >= 2 ? 'pb-24' : 'pb-10')}
    >
      {!readOnly && (
        <div className="px-2">
          <QuickAdd
            listId={list.id}
            inputRef={quickAddRef}
            onArrowDown={() => navKeys[0] && goTo(navKeys[0])}
          />
        </div>
      )}
      {isEmpty ? (
        <EmptyState icon={<ListIcon type="todo" className="size-8" />} title="No tasks yet">
          {readOnly ? null : (
            <>
              Add one above. Try “Send report friday 3pm p1” to set a date and priority as you type.
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => {
              closeDraft();
              if (!isSectionKey(String(active.id))) selectItem(String(active.id));
              setDrag({ activeId: String(active.id), overId: String(active.id), offsetX: 0 });
            }}
            onDragMove={({ delta }) => setDrag((d) => d && { ...d, offsetX: delta.x })}
            onDragOver={({ over }) =>
              setDrag((d) => d && { ...d, overId: over ? String(over.id) : d.activeId })
            }
            onDragEnd={onDragEnd}
            onDragCancel={() => setDrag(null)}
            measuring={showZone ? { droppable: { strategy: MeasuringStrategy.Always } } : undefined}
          >
            {showZone && <NoSectionZone over={drag?.overId === NO_SECTION_ID} />}
            <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
              {(!hasSections || unsectioned.length > 0) && (
                <div role="list" aria-label="Tasks">
                  {unsectioned}
                </div>
              )}
              {groups.slice(1).map((group) => {
                const section = group.section!;
                const nodes = rowsOf(group);
                const first = group === groups[1];
                return (
                  <div key={section.id} className="mt-2">
                    <SortableRow id={sectionKey(section.id)} disabled={readOnly}>
                      {(bits) => (
                        <SectionHeading
                          section={section}
                          count={group.count}
                          readOnly={readOnly}
                          tabbable={first && !visible.length}
                          renaming={renamingSectionId === section.id}
                          drag={bits}
                          actions={headingActions(group)}
                          onRenameDone={(title) => onRenameDone(group, title)}
                          onKeyDown={(e) => onHeadingKey(e, group)}
                        />
                      )}
                    </SortableRow>
                    {nodes.length > 0 && (
                      <div role="list" aria-label={`${section.title} tasks`}>
                        {nodes}
                      </div>
                    )}
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
          {!readOnly && (
            <button
              type="button"
              onClick={() => addSection(list.id)}
              className="mt-2 rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-hover hover:text-fg"
            >
              Add section
            </button>
          )}
          {!model.open.length && model.doneCount > 0 && !draftPlace && (
            <p className="px-2 py-3 text-sm text-fg-subtle">All done.</p>
          )}
          {model.doneCount > 0 && (
            <section className="mt-4">
              <button
                type="button"
                aria-expanded={list.showCompleted}
                onClick={() => setShowCompleted(list.id, !list.showCompleted)}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-fg-muted hover:bg-hover"
              >
                <ChevronRight
                  aria-hidden
                  className={clsx(
                    'size-3.5 transition-transform',
                    list.showCompleted && 'rotate-90',
                  )}
                />
                Completed
                <span className="font-normal text-fg-subtle tabular-nums">{model.doneCount}</span>
              </button>
              {list.showCompleted && (
                <div role="list" aria-label="Completed tasks">
                  {doneRows.map((row) => renderRow(row, visibleIndex.get(row)!))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
