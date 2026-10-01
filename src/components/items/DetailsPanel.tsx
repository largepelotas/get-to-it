import { useData } from '@/store/data';
import { useUI } from '@/store/ui';
import { ItemDetails } from './ItemDetails';

/**
 * The selected task's details, when the panel is open. `listId` limits it to
 * one list's tasks; Today and Upcoming show tasks from any list.
 */
export function DetailsPanel({ listId }: { listId?: string }) {
  const detailsOpen = useUI((s) => s.detailsOpen);
  const selectedId = useUI((s) => s.selectedItemId);
  // With several tasks selected there's no one task to show; it returns on a single selection.
  const several = useUI((s) => s.multiSelectedIds.length >= 2);
  const item = useData((s) => (selectedId ? s.tables.items[selectedId] : undefined));
  const list = useData((s) => (item ? s.tables.lists[item.listId] : undefined));
  if (several || !detailsOpen || !item || !list || item.deletedAt) return null;
  if (listId && item.listId !== listId) return null;
  return <ItemDetails item={item} readOnly={!!(list.deletedAt || list.archivedAt)} />;
}
