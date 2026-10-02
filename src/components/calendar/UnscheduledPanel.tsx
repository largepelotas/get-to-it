import { useMemo } from 'react';
import { SmartList, type SmartSection } from '@/components/items/SmartList';
import { useData } from '@/store/data';
import { unscheduledRows, unscheduledSections } from '@/store/calendar';

/** The id the Tasks button points at. */
export const UNSCHEDULED_PANEL_ID = 'calendar-unscheduled';

/** The calendar's side panel: open tasks with no date, by list, ready to drag onto a day. */
export function UnscheduledPanel() {
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const sections = useMemo<SmartSection[]>(
    () =>
      unscheduledSections(unscheduledRows(items, lists), Object.values(lists)).map(
        ({ list, rows }) => ({ key: `list:${list.id}`, title: list.title, rows }),
      ),
    [items, lists],
  );
  return (
    <aside
      id={UNSCHEDULED_PANEL_ID}
      aria-label="Unscheduled tasks"
      className="flex w-80 shrink-0 flex-col border-l border-line"
    >
      <div className="shrink-0 px-4 pt-8 pb-3">
        <h2 className="text-base font-semibold">Unscheduled</h2>
        <p className="mt-0.5 text-sm text-fg-muted">Drag a task onto a day.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {sections.length ? (
          <SmartList sections={sections} draggable />
        ) : (
          <p className="px-2 text-sm text-fg-muted">Every task has a date.</p>
        )}
      </div>
    </aside>
  );
}
