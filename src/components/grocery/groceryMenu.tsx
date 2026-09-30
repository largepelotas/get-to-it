import { ArrowDown, ArrowUp, Hash, Tag, Trash } from 'lucide-react';
import type { MenuEntries, MenuEntry } from '@/components/ui';
import type { Item } from '@/data/types';
import { setCategory } from '@/store/actions/grocery';
import { useData } from '@/store/data';
import { groupOf, OTHER_CATEGORY } from '@/store/grocery';

const icon = 'size-3.5';

/** The categories to file an item under, with its current one checked. */
export function categoryEntries(item: Item): MenuEntries {
  const categories = useData.getState().settings.groceryCategories;
  const current = groupOf(item, categories).id;
  return [
    ...categories.map((c): MenuEntry => ({
      label: c.name,
      checked: current === c.id,
      onSelect: () => setCategory(item.id, c.id),
    })),
    { kind: 'separator' },
    {
      label: OTHER_CATEGORY.name,
      checked: current === OTHER_CATEGORY.id,
      onSelect: () => setCategory(item.id, null),
    },
  ];
}

export interface GroceryMenuActions {
  editQuantity: () => void;
  /** Left out for items in the cart, which are listed by when they were checked. */
  moveUp?: () => void;
  moveDown?: () => void;
  remove: () => void;
}

/** The right-click menu of a grocery item. */
export function groceryMenuEntries(item: Item, actions: GroceryMenuActions): MenuEntries {
  return [
    {
      kind: 'sub',
      label: 'Category',
      icon: <Tag className={icon} />,
      entries: categoryEntries(item),
    },
    {
      label: item.quantity ? 'Edit quantity' : 'Add quantity',
      icon: <Hash className={icon} />,
      movesFocus: true,
      onSelect: actions.editQuantity,
    },
    { kind: 'separator' },
    actions.moveUp && {
      label: 'Move up',
      icon: <ArrowUp className={icon} />,
      shortcut: 'Alt+ArrowUp',
      onSelect: actions.moveUp,
    },
    actions.moveDown && {
      label: 'Move down',
      icon: <ArrowDown className={icon} />,
      shortcut: 'Alt+ArrowDown',
      onSelect: actions.moveDown,
    },
    { kind: 'separator' },
    {
      label: 'Delete',
      icon: <Trash className={icon} />,
      shortcut: 'Delete',
      danger: true,
      onSelect: actions.remove,
    },
  ];
}
