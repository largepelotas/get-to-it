import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton, Input } from '@/components/ui';
import { DEFAULT_GROCERY_CATEGORIES, type GroceryCategory } from '@/data/types';
import { newId } from '@/lib/id';
import { setSetting, useData } from '@/store/data';

function CategoryRow({
  category,
  first,
  last,
  only,
  autoFocus,
  onRename,
  onMove,
  onRemove,
}: {
  category: GroceryCategory;
  first: boolean;
  last: boolean;
  only: boolean;
  autoFocus: boolean;
  onRename: (name: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  // Holds a blank name while typing; it isn't saved, and goes back on blur.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <li className="flex items-center gap-1">
      <Input
        aria-label="Category name"
        value={draft ?? category.name}
        autoFocus={autoFocus}
        onFocus={(e) => autoFocus && e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim()) onRename(e.target.value.trim());
        }}
        onBlur={() => setDraft(null)}
        className="h-7 flex-1"
      />
      <IconButton
        size="sm"
        label={`Move ${category.name} up`}
        tooltip={false}
        disabled={first}
        icon={<ArrowUp className="size-3.5" />}
        onClick={() => onMove(-1)}
      />
      <IconButton
        size="sm"
        label={`Move ${category.name} down`}
        tooltip={false}
        disabled={last}
        icon={<ArrowDown className="size-3.5" />}
        onClick={() => onMove(1)}
      />
      <IconButton
        size="sm"
        label={`Remove ${category.name}`}
        tooltip={false}
        disabled={only}
        icon={<X className="size-3.5" />}
        onClick={onRemove}
      />
    </li>
  );
}

const sameAsDefaults = (categories: GroceryCategory[]) =>
  categories.length === DEFAULT_GROCERY_CATEGORIES.length &&
  categories.every(
    (c, i) =>
      c.id === DEFAULT_GROCERY_CATEGORIES[i].id && c.name === DEFAULT_GROCERY_CATEGORIES[i].name,
  );

/**
 * Renames, adds, removes and reorders the grocery categories. Items keep
 * their category id, so renaming keeps them in place; items in a removed
 * category show under Other.
 */
export function GroceryCategoriesEditor() {
  const categories = useData((s) => s.settings.groceryCategories);
  const [added, setAdded] = useState<string | null>(null);
  const save = (next: GroceryCategory[]) => setSetting('groceryCategories', next);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved);
    save(next);
  };

  const add = () => {
    const id = newId();
    save([...categories, { id, name: 'New category' }]);
    setAdded(id);
  };

  return (
    <div className="space-y-2">
      <ul aria-label="Grocery categories" className="space-y-1">
        {categories.map((category, i) => (
          <CategoryRow
            key={category.id}
            category={category}
            first={i === 0}
            last={i === categories.length - 1}
            only={categories.length === 1}
            autoFocus={category.id === added}
            onRename={(name) =>
              save(categories.map((c) => (c.id === category.id ? { ...c, name } : c)))
            }
            onMove={(direction) => move(i, direction)}
            onRemove={() => save(categories.filter((c) => c.id !== category.id))}
          />
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={add}>
          <Plus aria-hidden className="size-3.5" />
          Add category
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={sameAsDefaults(categories)}
          onClick={() => save(DEFAULT_GROCERY_CATEGORIES)}
        >
          Restore defaults
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        Items without a category, or in one you remove, are listed under Other.
      </p>
    </div>
  );
}
