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
import { ChevronRight } from 'lucide-react';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { clearCart, toggleItem, trashItems, uncheckCart } from '@/commands';
import type { DragBits } from '@/components/items/ItemRow';
import { ListIcon } from '@/components/ListIcon';
import { Button, type MenuEntries } from '@/components/ui';
import { EmptyState } from '@/components/views/ViewHeader';
import type { Item, List } from '@/data/types';
import { matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';
import { moveGroceryItem } from '@/store/actions/grocery';
import { deleteItems } from '@/store/actions/items';
import { setShowCompleted } from '@/store/actions/lists';
import { useData } from '@/store/data';
import { groceryModel, groupOf } from '@/store/grocery';
import { selectItem, useUI } from '@/store/ui';
import { groceryMenuEntries } from './groceryMenu';
import { GroceryQuickAdd } from './GroceryQuickAdd';
import { GroceryRow, type GroceryKeyMode } from './GroceryRow';

/** Something to focus after the next render. A new object each time, so repeats still apply. */
interface FocusRequest {
  target: string | 'quick-add';
  mode?: GroceryKeyMode;
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

function SectionTitle({ children, count }: { children: ReactNode; count: number }) {
  return (
    <h3 className="flex h-7 items-center gap-1.5 px-2 text-xs font-semibold text-fg-muted">
      {children}
      <span className="font-normal text-fg-subtle tabular-nums">{count}</span>
    </h3>
  );
}

export function GroceryList({ list }: { list: List }) {
  const items = useData((s) => s.tables.items);
  const categories = useData((s) => s.settings.groceryCategories);
  const model = useMemo(
    () => groceryModel(items, list.id, categories),
    [items, list.id, categories],
  );
  const selectedId = useUI((s) => s.selectedItemId);
  const readOnly = !!(list.deletedAt || list.archivedAt);

  const containerRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const cartRows = list.showCompleted ? model.cart : [];
  /** Every row in keyboard order. */
  const visible = [...model.open, ...cartRows];
  const inCart = (index: number) => index >= model.open.length;
  const selectionShown = visible.some((i) => i.id === selectedId);

  useLayoutEffect(() => {
    if (!focus) return;
    if (focus.target === 'quick-add') return quickAddRef.current?.focus();
    const row = containerRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${focus.target}"]`,
    );
    if (!row) return;
    if (!focus.mode || focus.mode === 'row') return row.focus();
    const input = row.querySelector<HTMLInputElement>(`input[data-field="${focus.mode}"]`);
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focus]);

  const focusRow = (id: string, mode: GroceryKeyMode = 'row') => {
    selectItem(id);
    setFocus({ target: id, mode });
  };
  const focusQuickAdd = () => setFocus({ target: 'quick-add' });

  /** The next row in the same section, else the previous one. */
  const neighbour = (index: number): Item | undefined => {
    const sameSection = (i: number) => i >= 0 && i < visible.length && inCart(i) === inCart(index);
    if (sameSection(index + 1)) return visible[index + 1];
    if (sameSection(index - 1)) return visible[index - 1];
  };

  const toggle = (index: number) => {
    const item = visible[index];
    // The item changes sections, so keep the keyboard where it was.
    const next = neighbour(index);
    toggleItem(item.id, !item.checked);
    if (next) focusRow(next.id);
  };

  /** Swaps an open item with its neighbour in the same category. */
  const moveBy = (item: Item, direction: -1 | 1) => {
    const group = model.groups.find((g) => g.items.includes(item));
    if (!group) return;
    const i = group.items.indexOf(item);
    const other = group.items[i + direction];
    if (!other) return;
    moveGroceryItem(
      item.id,
      group.category.id,
      direction < 0 ? { before: other.id } : { after: other.id },
    );
  };

  const remove = (index: number) => {
    const next = neighbour(index);
    trashItems([visible[index].id]);
    if (next) focusRow(next.id);
    else focusQuickAdd();
  };

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: GroceryKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const item = visible[index];
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = visible[index + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next) focusRow(next.id, mode);
      else if (e.key === 'ArrowUp' && !readOnly) focusQuickAdd();
    } else if (is('Escape') || (mode !== 'row' && is('Enter'))) {
      e.preventDefault();
      if (mode !== 'row') focusRow(item.id, 'row');
      else {
        selectItem(null);
        containerRef.current?.focus();
      }
    } else if (mode === 'row' && is('Enter')) {
      e.preventDefault();
      focusRow(item.id, 'name');
    } else if (mode === 'name' && is('Tab')) {
      e.preventDefault();
      focusRow(item.id, 'quantity');
    } else if (mode === 'quantity' && is('Shift+Tab')) {
      e.preventDefault();
      focusRow(item.id, 'name');
    } else if (readOnly) {
      return;
    } else if (is('Alt+ArrowUp') || is('Alt+ArrowDown')) {
      e.preventDefault();
      if (!inCart(index)) moveBy(item, e.key === 'ArrowUp' ? -1 : 1);
      focusRow(item.id, mode);
    } else if (is('Mod+Enter') || (mode === 'row' && is(' '))) {
      e.preventDefault();
      toggle(index);
    } else if (mode === 'row' && (is('Backspace') || is('Delete'))) {
      e.preventDefault();
      remove(index);
    } else if (mode === 'name' && is('Backspace') && (e.target as HTMLInputElement).value === '') {
      // Clearing an item's name and pressing Backspace removes it.
      e.preventDefault();
      const next = visible[index - 1] ?? visible[index + 1];
      deleteItems([item.id]);
      if (next) focusRow(next.id, 'name');
      else focusQuickAdd();
    }
  };

  const menuFor = (index: number) => (): MenuEntries => {
    const item = visible[index];
    return groceryMenuEntries(item, {
      editQuantity: () => focusRow(item.id, 'quantity'),
      moveUp: inCart(index) ? undefined : () => moveBy(item, -1),
      moveDown: inCart(index) ? undefined : () => moveBy(item, 1),
      remove: () => remove(index),
    });
  };

  // Dragging reorders within a category, or files the item under the one it's dropped in.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = model.open.findIndex((i) => i.id === active.id);
    const to = model.open.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const target = model.open[to];
    moveGroceryItem(
      String(active.id),
      groupOf(target, categories).id,
      from < to ? { after: target.id } : { before: target.id },
    );
  };

  const renderRow = (item: Item, index: number, drag?: DragBits) => (
    <GroceryRow
      key={item.id}
      item={item}
      drag={drag}
      readOnly={readOnly}
      selected={item.id === selectedId}
      tabbable={item.id === selectedId || (index === 0 && !selectionShown)}
      categoryName={item.checked ? groupOf(item, categories).name : undefined}
      menu={readOnly ? undefined : menuFor(index)}
      onSelect={() => selectItem(item.id)}
      onKeyDown={(e, mode) => onRowKey(e, index, mode)}
    />
  );

  const isEmpty = !model.open.length && !model.cart.length;

  return (
    <div ref={containerRef} tabIndex={-1} className="px-6 pb-10 outline-none">
      {!readOnly && (
        <div className="px-2">
          <GroceryQuickAdd
            listId={list.id}
            inputRef={quickAddRef}
            onArrowDown={() => visible[0] && focusRow(visible[0].id)}
          />
        </div>
      )}
      {isEmpty ? (
        <EmptyState icon={<ListIcon type="grocery" className="size-8" />} title="No groceries yet">
          {readOnly
            ? null
            : 'Add one above. Items are sorted into categories as you add them, and checked items go in the cart.'}
        </EmptyState>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={model.open.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {model.groups.map((group) => (
                <section key={group.category.id} className="mt-2">
                  <SectionTitle count={group.items.length}>{group.category.name}</SectionTitle>
                  <div role="list" aria-label={group.category.name}>
                    {group.items.map((item) => {
                      const index = model.open.indexOf(item);
                      return (
                        <SortableRow key={item.id} id={item.id} disabled={readOnly}>
                          {(bits) => renderRow(item, index, bits)}
                        </SortableRow>
                      );
                    })}
                  </div>
                </section>
              ))}
            </SortableContext>
          </DndContext>
          {!model.open.length && (
            <p className="px-2 py-3 text-sm text-fg-subtle">Everything’s in the cart.</p>
          )}
          {model.cart.length > 0 && (
            <section className="mt-4">
              <div className="flex items-center gap-1">
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
                  In cart
                  <span className="font-normal text-fg-subtle tabular-nums">
                    {model.cart.length}
                  </span>
                </button>
                <span className="flex-1" />
                {!readOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-fg-muted"
                      onClick={() => uncheckCart(list.id)}
                    >
                      Uncheck all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-fg-muted"
                      onClick={() => clearCart(list.id)}
                    >
                      Clear checked
                    </Button>
                  </>
                )}
              </div>
              {list.showCompleted && (
                <div role="list" aria-label="In cart">
                  {cartRows.map((item, i) => renderRow(item, model.open.length + i))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
