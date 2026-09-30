import {
  closestCenter,
  DndContext,
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
import { toggleItem, trashItems } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import type { MenuEntries } from '@/components/ui';
import { EmptyState } from '@/components/views/ViewHeader';
import type { List } from '@/data/types';
import { matchesShortcut } from '@/lib/shortcuts';
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
import { useData } from '@/store/data';
import { endOfSubtree, todoModel } from '@/store/todo';
import { MAX_DEPTH, projectDrop, type FlatRow } from '@/store/tree';
import { closeDetails, openDetails, selectItem, useUI } from '@/store/ui';
import { itemMenuEntries } from './itemMenu';
import { DraftRow, INDENT, ItemRow, type DragBits, type RowKeyMode } from './ItemRow';
import { QuickAdd } from './QuickAdd';

/** Where the inline new-task field sits: under `parentId`, after the sibling `after` (null = first). */
interface Draft {
  parentId: string | null;
  after: string | null;
}

/** Something to focus after the next render. A new object each time, so repeats still apply. */
interface FocusRequest {
  target: string | 'draft' | 'quick-add';
  mode?: RowKeyMode;
  caretAtEnd?: boolean;
}

interface DragState {
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
  const model = useMemo(() => todoModel(items, list.id), [items, list.id]);
  const selectedId = useUI((s) => s.selectedItemId);
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

  const doneRows = list.showCompleted ? model.done : [];
  /** Every row in keyboard order. */
  const visible = [...model.open, ...doneRows];
  const inDone = (index: number) => index >= model.open.length;
  const selectionShown = visible.some((r) => r.item.id === selectedId);

  useLayoutEffect(() => {
    if (!focus) return;
    if (focus.target === 'draft') return draftRef.current?.focus();
    if (focus.target === 'quick-add') return quickAddRef.current?.focus();
    const row = containerRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${focus.target}"]`,
    );
    if (!row) return;
    if (focus.mode !== 'text') return row.focus();
    const input = row.querySelector('input');
    if (!input) return;
    input.focus();
    if (focus.caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  }, [focus]);

  const focusRow = (id: string, mode: RowKeyMode = 'row', caretAtEnd = false) => {
    selectItem(id);
    setFocus({ target: id, mode, caretAtEnd });
  };
  const focusQuickAdd = () => setFocus({ target: 'quick-add' });

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
    closeDraft();
    if (back) focusRow(back, mode, true);
    else focusQuickAdd();
  };

  const draftPlace = useMemo(() => {
    if (!draft || drag) return null;
    const rows = model.open;
    if (draft.after) {
      const i = rows.findIndex((r) => r.item.id === draft.after);
      return i < 0 ? null : { index: endOfSubtree(rows, i), depth: rows[i].depth };
    }
    if (draft.parentId) {
      const i = rows.findIndex((r) => r.item.id === draft.parentId);
      return i < 0 ? null : { index: i + 1, depth: rows[i].depth + 1 };
    }
    return { index: 0, depth: 0 };
  }, [draft, drag, model.open]);

  const submitDraft = () => {
    if (!draft) return;
    const id = createItemFromText(list.id, draftText, draft);
    if (!id) return leaveDraft('row');
    openDraft({ parentId: draft.parentId, after: id });
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || !draft) return;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);
    const rows = model.open;
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
    const row = model.open[index];
    if (row.item.collapsed) setItemCollapsed(row.item.id, false);
    openDraft({
      parentId: row.item.id,
      after: row.item.collapsed ? null : lastChild(model.open, index),
    });
  };

  const openDraftAfter = (index: number) => {
    if (inDone(index)) {
      const lastTop = [...model.open].reverse().find((r) => r.depth === 0);
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

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: RowKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const row = visible[index];
    const id = row.item.id;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    if (is('Mod+I')) {
      e.preventDefault();
      toggleDetails(id);
    } else if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = visible[index + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next) focusRow(next.item.id, mode, true);
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
      moveItemBy(id, e.key === 'ArrowUp' ? -1 : 1);
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
    return itemMenuEntries(row.item, {
      openDetails: () => openDetails(id),
      addSubtask: !inDone(index) && row.depth < MAX_DEPTH ? () => addSubtask(index) : undefined,
      indent: () => indentItem(id),
      outdent: () => outdentItem(id),
      moveUp: () => moveItemBy(id, -1),
      moveDown: () => moveItemBy(id, 1),
      remove: () => trashItems([id]),
    });
  };

  // Dragging.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const projection = drag
    ? projectDrop(model.open, drag.activeId, drag.overId, drag.offsetX, INDENT)
    : null;
  const shownOpen = useMemo(() => {
    if (!drag) return model.open;
    // The dragged task's subtasks travel with it, so hide them for now.
    const i = model.open.findIndex((r) => r.item.id === drag.activeId);
    return i < 0
      ? model.open
      : [...model.open.slice(0, i + 1), ...model.open.slice(endOfSubtree(model.open, i))];
  }, [drag, model.open]);

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    setDrag(null);
    if (!over) return;
    const rows = model.open;
    const target = projectDrop(rows, String(active.id), String(over.id), delta.x, INDENT);
    const i = rows.findIndex((r) => r.item.id === active.id);
    if (!target || i < 0) return;
    if (target.parentId === shownParent(rows[i]) && target.afterId === prevSibling(rows, i)) return;
    moveItem(String(active.id), target.parentId, target.afterId);
  };

  const renderRow = (row: FlatRow, index: number, drag?: DragBits, depth?: number) => (
    <ItemRow
      key={row.item.id}
      row={row}
      depth={depth}
      drag={drag}
      readOnly={readOnly}
      selected={row.item.id === selectedId}
      tabbable={row.item.id === selectedId || (index === 0 && !selectionShown)}
      menu={menuFor(index)}
      onSelect={() => selectItem(row.item.id)}
      onOpenDetails={() => openDetails(row.item.id)}
      onKeyDown={(e, mode) => onRowKey(e, index, mode)}
    />
  );

  const openRows: ReactNode[] = shownOpen.map((row) => {
    const index = model.open.indexOf(row);
    const isActive = drag?.activeId === row.item.id;
    return (
      <SortableRow key={row.item.id} id={row.item.id} disabled={readOnly}>
        {(bits) => renderRow(row, index, bits, isActive ? projection?.depth : undefined)}
      </SortableRow>
    );
  });
  if (draftPlace) {
    openRows.splice(
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

  const isEmpty = !model.open.length && !model.doneCount && !draftPlace;

  return (
    <div ref={containerRef} tabIndex={-1} className="px-6 pb-10 outline-none">
      {!readOnly && (
        <div className="px-2">
          <QuickAdd
            listId={list.id}
            inputRef={quickAddRef}
            onArrowDown={() => visible[0] && focusRow(visible[0].item.id)}
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
              selectItem(String(active.id));
              setDrag({ activeId: String(active.id), overId: String(active.id), offsetX: 0 });
            }}
            onDragMove={({ delta }) => setDrag((d) => d && { ...d, offsetX: delta.x })}
            onDragOver={({ over }) =>
              setDrag((d) => d && { ...d, overId: over ? String(over.id) : d.activeId })
            }
            onDragEnd={onDragEnd}
            onDragCancel={() => setDrag(null)}
          >
            <SortableContext
              items={shownOpen.map((r) => r.item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div role="list" aria-label="Tasks">
                {openRows}
              </div>
            </SortableContext>
          </DndContext>
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
                  {doneRows.map((row, i) => renderRow(row, model.open.length + i))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
