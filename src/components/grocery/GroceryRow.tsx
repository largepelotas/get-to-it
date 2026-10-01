import clsx from 'clsx';
import { GripVertical, Tag } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { toggleItem } from '@/commands';
import { Checkbox } from '@/components/items/Checkbox';
import type { DragBits } from '@/components/items/ItemRow';
import { ContextMenu, IconButton, Menu, type MenuEntries } from '@/components/ui';
import type { Item } from '@/data/types';
import { setQuantity } from '@/store/actions/grocery';
import { setItemText } from '@/store/actions/items';
import { categoryEntries } from './groceryMenu';

/** Where a key was pressed: on the row itself, or in its name or quantity field. */
export type GroceryKeyMode = 'row' | 'name' | 'quantity';

export interface GroceryRowProps {
  item: Item;
  selected: boolean;
  /** Takes part in keyboard focus (the selected row, or the first row). */
  tabbable: boolean;
  readOnly: boolean;
  drag?: DragBits;
  /** Shown for items in the cart, which aren't grouped. */
  categoryName?: string;
  /** The right-click menu; left out when the list is read-only. */
  menu?: () => MenuEntries;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, mode: GroceryKeyMode) => void;
  onSelect: () => void;
}

/**
 * A text field as wide as its text (a hidden copy sizes it), edited in
 * place. Blank values are kept while typing, since the store may ignore them.
 */
function FitField({
  value,
  label,
  field,
  placeholder,
  readOnly,
  className,
  onChange,
}: {
  value: string;
  label: string;
  field: 'name' | 'quantity';
  placeholder?: string;
  readOnly: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <span className={clsx('grid min-w-0', className)}>
      <span aria-hidden className="invisible col-start-1 row-start-1 truncate pr-1 whitespace-pre">
        {shown || placeholder || ' '}
      </span>
      <input
        aria-label={label}
        data-field={field}
        // The hidden copy sets the width; without this the browser's default input width wins.
        size={1}
        value={shown}
        placeholder={placeholder}
        readOnly={readOnly}
        tabIndex={-1}
        spellCheck={field === 'name'}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => setDraft(null)}
        className="col-start-1 row-start-1 w-full min-w-6 truncate bg-transparent py-0.5 outline-none placeholder:text-fg-subtle"
      />
    </span>
  );
}

export function GroceryRow({
  item,
  selected,
  tabbable,
  readOnly,
  drag,
  categoryName,
  menu,
  onKeyDown,
  onSelect,
}: GroceryRowProps) {
  // Read after the name: the quantity, and the category for items in the cart.
  const description = [
    item.quantity && `Quantity ${item.quantity}`,
    item.checked && 'In cart',
    categoryName,
  ]
    .filter(Boolean)
    .join('. ');
  const descriptionId = `row-desc-${item.id}`;
  const row = (
    <div
      ref={drag?.ref}
      style={drag?.style}
      role="listitem"
      data-item-id={item.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={item.text}
      aria-describedby={description ? descriptionId : undefined}
      aria-current={selected ? 'true' : undefined}
      onFocus={onSelect}
      onClick={(e) => {
        onSelect();
        // Clicks outside the fields (including the checkbox) leave the row focused for keys.
        if (!(e.target as HTMLElement).closest('input')) e.currentTarget.focus();
      }}
      onKeyDown={(e) => {
        const field = (e.target as HTMLElement).dataset.field;
        onKeyDown(e, field === 'name' || field === 'quantity' ? field : 'row');
      }}
      className={clsx(
        'group relative flex h-8 items-center gap-1.5 rounded-md pr-1 outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        selected ? 'bg-selected' : 'hover:bg-hover',
        drag?.dragging && 'z-10 bg-elevated shadow-popover',
      )}
    >
      {drag && !readOnly ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Drag to move"
          {...drag.handle}
          className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-fg-subtle opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <Checkbox
        checked={item.checked}
        disabled={readOnly}
        label={item.text}
        onChange={(checked) => toggleItem(item.id, checked)}
      />
      <FitField
        label="Item"
        field="name"
        value={item.text}
        readOnly={readOnly}
        onChange={(text) => setItemText(item.id, text)}
        className={clsx('text-sm', item.checked ? 'text-fg-subtle line-through' : 'text-fg')}
      />
      <FitField
        label="Quantity"
        field="quantity"
        value={item.quantity ?? ''}
        placeholder={readOnly ? undefined : 'Qty'}
        readOnly={readOnly}
        onChange={(quantity) => setQuantity(item.id, quantity)}
        className={clsx(
          'rounded px-1.5 text-xs tabular-nums',
          item.quantity ? 'bg-hover text-fg-muted' : 'text-fg-subtle',
          // An empty quantity only shows its placeholder on the row being worked on.
          !item.quantity &&
            !selected &&
            'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}
      />
      <span className="min-w-0 flex-1 self-stretch" />
      {description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
      {categoryName && (
        <span className="shrink-0 truncate pl-1 text-xs text-fg-subtle">{categoryName}</span>
      )}
      {!readOnly && (
        <Menu
          align="end"
          entries={() => categoryEntries(item)}
          trigger={
            <IconButton
              size="sm"
              label="Category"
              tabIndex={-1}
              icon={<Tag className="size-3.5" />}
              className={clsx(!selected && 'opacity-0 group-hover:opacity-100')}
            />
          }
        />
      )}
    </div>
  );
  return menu ? <ContextMenu entries={menu}>{row}</ContextMenu> : row;
}
