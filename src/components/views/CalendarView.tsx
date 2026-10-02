import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import clsx from 'clsx';
import { Calendar, ChevronLeft, ChevronRight, PanelRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { moveTasksToDay } from '@/commands';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { UNSCHEDULED_PANEL_ID, UnscheduledPanel } from '@/components/calendar/UnscheduledPanel';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { Button, IconButton } from '@/components/ui';
import { CALENDAR_LAYOUTS, type CalendarLayout } from '@/data/types';
import { useItemsWithReminders } from '@/hooks/useReminders';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, addMonthsKey, weekDays, type DateKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { monthTitle, rangeTitle, rowsByDay, unscheduledRows } from '@/store/calendar';
import { setSetting, useData } from '@/store/data';
import { useFocus } from '@/store/focus';
import { dueRows, type DueRow } from '@/store/smart';
import { selectedIds, selectItem, useUI } from '@/store/ui';
import { dropIds } from '@/components/calendar/dropIds';
import { dateFromDropId } from './dayDrop';
import { EmptyState, ViewHeader } from './ViewHeader';

const LAYOUT_LABEL: Record<CalendarLayout, string> = {
  month: 'Month',
  week: 'Week',
  days: '3 days',
};

/** How many days the "3 days" layout shows. */
const SEVERAL_DAYS = 3;

/** The days a non-month layout covers, from the anchor. */
function layoutDays(layout: CalendarLayout, anchor: DateKey, weekStartsOn: 0 | 1): DateKey[] {
  return layout === 'week'
    ? weekDays(anchor, weekStartsOn)
    : Array.from({ length: SEVERAL_DAYS }, (_, i) => addDaysKey(anchor, i));
}

/**
 * The Calendar: a month of days holding their tasks, an optional side panel of
 * undated tasks, and dragging a task onto a day to give it that date.
 */
export function CalendarView() {
  const today = useToday();
  const layout = useData((s) => s.settings.calendarLayout);
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const selectedId = useUI((s) => s.selectedItemId);
  const focusedId = useFocus((s) => s.timer?.itemId ?? null);
  const reminded = useItemsWithReminders();
  const [anchor, setAnchor] = useState<DateKey>(today);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dragged, setDragged] = useState<DueRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const rows = useMemo(() => dueRows(items, lists), [items, lists]);
  const byDay = useMemo(() => rowsByDay(rows), [rows]);
  const undated = useMemo(
    () => (panelOpen ? unscheduledRows(items, lists) : []),
    [panelOpen, items, lists],
  );

  const days = layout === 'month' ? null : layoutDays(layout, anchor, weekStartsOn);
  const subtitle = days ? rangeTitle(days) : monthTitle(anchor);
  const atToday = days ? days.includes(today) : anchor.slice(0, 7) === today.slice(0, 7);
  const step = (direction: 1 | -1) =>
    setAnchor(
      layout === 'month'
        ? addMonthsKey(anchor, direction)
        : addDaysKey(anchor, direction * (layout === 'week' ? 7 : SEVERAL_DAYS)),
    );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const date = over ? dateFromDropId(String(over.id)) : null;
    if (!date) return;
    moveTasksToDay(dropIds(String(active.id), selectedIds()), date);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        const id = String(active.id);
        // Keep a multi-selection the dragged task belongs to, so it all moves together.
        if (!selectedIds().includes(id)) selectItem(id);
        setDragged([...rows, ...undated].find((r) => r.item.id === id) ?? null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ViewHeader
            icon={<Calendar className="size-6" style={{ color: colorVar('blue') }} />}
            title="Calendar"
            subtitle={subtitle}
            actions={
              <>
                <div role="group" aria-label="Layout" className="mr-2 flex items-center gap-0.5">
                  {CALENDAR_LAYOUTS.map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant="ghost"
                      aria-pressed={layout === value}
                      className={clsx(layout === value && 'bg-selected font-medium')}
                      onClick={() => setSetting('calendarLayout', value)}
                    >
                      {LAYOUT_LABEL[value]}
                    </Button>
                  ))}
                </div>
                <IconButton
                  label="Previous"
                  icon={<ChevronLeft className="size-4" />}
                  onClick={() => step(-1)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={atToday}
                  onClick={() => setAnchor(today)}
                >
                  Today
                </Button>
                <IconButton
                  label="Next"
                  icon={<ChevronRight className="size-4" />}
                  onClick={() => step(1)}
                />
                <IconButton
                  label="Tasks"
                  icon={<PanelRight className="size-4" />}
                  aria-pressed={panelOpen}
                  aria-controls={panelOpen ? UNSCHEDULED_PANEL_ID : undefined}
                  className={clsx(panelOpen && 'bg-selected text-fg')}
                  onClick={() => setPanelOpen((open) => !open)}
                />
              </>
            }
          />
          {layout === 'month' ? (
            <MonthGrid
              anchor={anchor}
              today={today}
              weekStartsOn={weekStartsOn}
              byDay={byDay}
              selectedId={selectedId}
              reminded={reminded}
              focusedId={focusedId}
            />
          ) : (
            <EmptyState title="Week and 3-day layouts are coming." />
          )}
        </div>
        {panelOpen && <UnscheduledPanel />}
        <DetailsPanel />
      </div>
      <DragOverlay>
        {dragged && (
          <div className="flex h-8 items-center rounded-md bg-elevated px-3 text-sm shadow-popover">
            <span className="truncate">{dragged.item.text}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
