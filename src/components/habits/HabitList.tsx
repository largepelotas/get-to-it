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
import { Plus } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { trashItems } from '@/commands';
import type { DragBits } from '@/components/items/ItemRow';
import { ListIcon } from '@/components/ListIcon';
import type { MenuEntries } from '@/components/ui';
import { EmptyState } from '@/components/views/ViewHeader';
import type { Item, List } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';
import { addHabit, toggleCheckIn } from '@/store/actions/habits';
import { deleteItems, moveItem, moveItemBy } from '@/store/actions/items';
import { useData } from '@/store/data';
import { bySortKey } from '@/lib/order';
import { lastDays } from '@/store/stats';
import { clearReveal, openDetails, selectItem, useUI } from '@/store/ui';
import { habitMenuEntries } from './habitMenu';
import { habitStatus } from './habitStatus';
import { HabitRow, type HabitKeyMode } from './HabitRow';

/** Something to focus after the next render. A new object each time, so repeats still apply. */
interface FocusRequest {
  target: string | 'quick-add';
  mode?: HabitKeyMode;
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
    style: { transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition },
    dragging: isDragging,
    handle: { ...attributes, ...listeners, tabIndex: -1 },
  });
}

function HabitQuickAdd({
  listId,
  inputRef,
  onArrowDown,
}: {
  listId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArrowDown: () => void;
}) {
  const [text, setText] = useState('');
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (addHabit(listId, text)) setText('');
    } else if (e.key === 'Escape') {
      if (text) setText('');
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onArrowDown();
    }
  };
  return (
    <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-line-control bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
      <Plus aria-hidden className="size-4 shrink-0 text-fg-subtle" />
      <input
        ref={inputRef}
        aria-label="Add a habit"
        data-quick-add
        placeholder="Add a habit, like “Read for 20 minutes”"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
    </label>
  );
}

/** A habit list: a quick add, then a row per habit with its streak and last seven days. */
export function HabitList({ list }: { list: List }) {
  const allItems = useData((s) => s.tables.items);
  const checkIns = useData((s) => s.tables.checkIns);
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const today = useToday();
  const selectedId = useUI((s) => s.selectedItemId);
  const reveal = useUI((s) => s.reveal);
  const readOnly = !!(list.deletedAt || list.archivedAt);

  const items = useMemo(
    () =>
      Object.values(allItems)
        .filter((i) => i.listId === list.id && !i.deletedAt)
        .sort(bySortKey),
    [allItems, list.id],
  );
  const statuses = useMemo(() => {
    const mine = new Set(items.map((i) => i.id));
    const own = Object.values(checkIns).filter((c) => mine.has(c.itemId));
    return new Map(
      items.map((i) => [i.id, habitStatus(i.habit, own, i.id, today, weekStartsOn)] as const),
    );
  }, [items, checkIns, today, weekStartsOn]);
  const week = useMemo(() => lastDays(today, 7), [today]);
  const doneToday = items.filter((i) => statuses.get(i.id)?.days.has(today)).length;
  const selectionShown = items.some((i) => i.id === selectedId);

  const containerRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  useLayoutEffect(() => {
    if (!focus) return;
    if (focus.target === 'quick-add') return quickAddRef.current?.focus();
    const row = containerRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${focus.target}"]`,
    );
    if (!row) return;
    if (focus.mode !== 'name') return row.focus();
    const input = row.querySelector<HTMLInputElement>('input[data-field="name"]');
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focus]);

  // A habit opened from search: bring its row into view with focus.
  useLayoutEffect(() => {
    if (!reveal) return;
    containerRef.current?.querySelector<HTMLElement>(`[data-item-id="${reveal}"]`)?.focus();
    clearReveal();
  }, [reveal]);

  const focusRow = (id: string, mode: HabitKeyMode = 'row') => {
    selectItem(id);
    setFocus({ target: id, mode });
  };
  const focusQuickAdd = () => setFocus({ target: 'quick-add' });

  const remove = (index: number) => {
    const next = items[index + 1] ?? items[index - 1];
    trashItems([items[index].id]);
    if (next) focusRow(next.id);
    else focusQuickAdd();
  };

  const moveBy = (item: Item, direction: -1 | 1) => {
    moveItemBy(item.id, direction);
  };

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: HabitKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const item = items[index];
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = items[index + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next) focusRow(next.id, mode);
      else if (e.key === 'ArrowUp' && !readOnly) focusQuickAdd();
    } else if (is('Escape') || (mode === 'name' && is('Enter'))) {
      e.preventDefault();
      if (mode === 'name') focusRow(item.id, 'row');
      else {
        selectItem(null);
        containerRef.current?.focus();
      }
    } else if (mode === 'row' && is('Enter')) {
      e.preventDefault();
      openDetails(item.id);
    } else if (readOnly) {
      return;
    } else if (is('Alt+ArrowUp') || is('Alt+ArrowDown')) {
      e.preventDefault();
      moveBy(item, e.key === 'ArrowUp' ? -1 : 1);
      focusRow(item.id, mode);
    } else if (mode === 'row' && is(' ')) {
      e.preventDefault();
      toggleCheckIn(item.id, today);
    } else if (mode === 'row' && (is('Backspace') || is('Delete'))) {
      e.preventDefault();
      remove(index);
    } else if (mode === 'name' && is('Backspace') && (e.target as HTMLInputElement).value === '') {
      // Clearing a habit's name and pressing Backspace removes it.
      e.preventDefault();
      const next = items[index - 1] ?? items[index + 1];
      deleteItems([item.id]);
      if (next) focusRow(next.id, 'name');
      else focusQuickAdd();
    }
  };

  const menuFor = (index: number) => (): MenuEntries => {
    const item = items[index];
    return habitMenuEntries(item, {
      checkedToday: !!statuses.get(item.id)?.days.has(today),
      toggleToday: () => toggleCheckIn(item.id, today),
      rename: () => focusRow(item.id, 'name'),
      moveUp: () => moveBy(item, -1),
      moveDown: () => moveBy(item, 1),
      remove: () => remove(index),
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    moveItem(String(active.id), null, from < to ? items[to].id : (items[to - 1]?.id ?? null));
  };

  return (
    <div ref={containerRef} tabIndex={-1} className="@container px-6 pb-10 outline-none">
      {!readOnly && (
        <div className="px-2">
          <HabitQuickAdd
            listId={list.id}
            inputRef={quickAddRef}
            onArrowDown={() => items[0] && focusRow(items[0].id)}
          />
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          icon={<ListIcon type="habit" className="size-8" />}
          title={readOnly ? 'No habits yet.' : 'No habits yet. Add one above.'}
        />
      ) : (
        <>
          <p aria-live="polite" className="px-2 pb-2 text-sm text-fg-muted">
            {doneToday} of {items.length} done today
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div role="list" aria-label="Habits">
                {items.map((item, index) => (
                  <SortableRow key={item.id} id={item.id} disabled={readOnly}>
                    {(drag) => (
                      <HabitRow
                        item={item}
                        status={statuses.get(item.id)!}
                        today={today}
                        week={week}
                        drag={drag}
                        readOnly={readOnly}
                        selected={item.id === selectedId}
                        tabbable={item.id === selectedId || (index === 0 && !selectionShown)}
                        menu={readOnly ? undefined : menuFor(index)}
                        onToggleDay={(day) => toggleCheckIn(item.id, day)}
                        onSelect={() => selectItem(item.id)}
                        onOpen={() => openDetails(item.id)}
                        onKeyDown={(e, mode) => onRowKey(e, index, mode)}
                      />
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
