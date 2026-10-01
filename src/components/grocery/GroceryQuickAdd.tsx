import { Plus } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { guessCategory, parseGroceryText } from '@/lib/grocery';
import { createGroceryItem, groceryListIds } from '@/store/actions/grocery';
import { useData } from '@/store/data';
import { categoryHistory, OTHER_CATEGORY } from '@/store/grocery';

export interface GroceryQuickAddProps {
  listId: string;
  inputRef?: Ref<HTMLInputElement>;
  /** ArrowDown moves on into the list. */
  onArrowDown?: () => void;
}

/**
 * The "Add an item" field of a grocery list. A preview shows the quantity it
 * read and the category the item will go under.
 */
export function GroceryQuickAdd({ listId, inputRef, onArrowDown }: GroceryQuickAddProps) {
  const [text, setText] = useState('');
  const tables = useData((s) => s.tables);
  const categories = useData((s) => s.settings.groceryCategories);
  const parsed = useMemo(() => (text.trim() ? parseGroceryText(text) : null), [text]);
  const history = useMemo(
    () => (parsed ? categoryHistory(tables.items, groceryListIds(tables)) : null),
    [parsed, tables],
  );
  const chips = useMemo(() => {
    if (!parsed || !history) return [];
    const category = guessCategory(parsed.name, categories, history);
    const name = categories.find((c) => c.id === category)?.name ?? OTHER_CATEGORY.name;
    return [...(parsed.quantity ? [`Qty ${parsed.quantity}`] : []), name];
  }, [parsed, history, categories]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (createGroceryItem(listId, text)) setText('');
    } else if (e.key === 'Escape') {
      if (text) setText('');
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' && onArrowDown) {
      e.preventDefault();
      onArrowDown();
    }
  };

  return (
    <div className="mb-2">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line-control bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
        <Plus aria-hidden className="size-4 shrink-0 text-fg-subtle" />
        <input
          ref={inputRef}
          aria-label="Add an item"
          data-quick-add
          placeholder="Add an item, like “2 lemons” or “milk 1 l”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
      {chips.length > 0 && (
        <div aria-live="polite" className="mt-1.5 flex flex-wrap gap-1.5 px-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
