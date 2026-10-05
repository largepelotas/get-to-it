import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import clsx from 'clsx';
import { Calendar, ChevronLeft, ChevronRight, PanelRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { moveTasksToDay, moveTaskToTime } from '@/commands';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { HOUR_PX, TimeGrid, type SlotGhost } from '@/components/calendar/TimeGrid';
import { UNSCHEDULED_PANEL_ID, UnscheduledPanel } from '@/components/calendar/UnscheduledPanel';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { Button, IconButton } from '@/components/ui';
import { CALENDAR_LAYOUTS, type CalendarLayout } from '@/data/types';
import { useItemsWithReminders } from '@/hooks/useReminders';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, addMonthsKey, timeOfMinutes, weekDays, type DateKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import {
  monthTitle,
  rangeTitle,
  entriesByDay,
  slotFromOffset,
  unscheduledRows,
} from '@/store/calendar';
import { setSetting, useData } from '@/store/data';
import { useEventsByDay } from '@/store/feeds';
import { useFocus } from '@/store/focus';
import { dueRows, type DueRow } from '@/store/smart';
import { selectedIds, selectItem, useUI } from '@/store/ui';
import { dropIds } from '@/components/calendar/dropIds';
import { dateFromDropId, dropKind } from './dayDrop';
import { ViewHeader } from './ViewHeader';

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
  const [ghost, setGhost] = useState<SlotGhost | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const rows = useMemo(() => dueRows(items, lists), [items, lists]);
  const events = useEventsByDay();
  const byDay = useMemo(() => entriesByDay(rows, events), [rows, events]);
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

  /** The day and time under a dragged task over a time-grid column, or null elsewhere. */
  const slotUnder = ({ active, over }: DragMoveEvent | DragEndEvent): SlotGhost | null => {
    if (!over || dropKind(String(over.id)) !== 'slot') return null;
    const date = dateFromDropId(String(over.id));
    const top = active.rect.current.translated?.top;
    // The column's rect and the dragged element's rect are both on screen, so the grid's own scroll cancels out.
    return date && top !== undefined
      ? { date, minutes: slotFromOffset(top - over.rect.top, HOUR_PX) }
      : null;
  };

  const onDragMove = (event: DragMoveEvent) => {
    const next = slotUnder(event);
    setGhost((prev) =>
      prev?.date === next?.date && prev?.minutes === next?.minutes ? prev : next,
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    setGhost(null);
    const { active, over } = event;
    const date = over ? dateFromDropId(String(over.id)) : null;
    if (!date || !over) return;
    const id = String(active.id);
    const kind = dropKind(String(over.id));
    if (kind === 'slot') {
      // Only the dragged task takes the time; the rest of a selection keep theirs.
      const slot = slotUnder(event);
      if (slot) moveTaskToTime(id, date, timeOfMinutes(slot.minutes));
      return;
    }
    const ids = dropIds(id, selectedIds());
    const only = ids.length === 1 ? rows.find((r) => r.item.id === ids[0]) : undefined;
    // On the all-day row a timed task loses its time; a day drop (month) keeps it.
    if (kind === 'allday' && only?.item.dueTime) moveTaskToTime(only.item.id, date, null);
    else moveTasksToDay(ids, date);
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
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragged(null);
        setGhost(null);
      }}
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
            <TimeGrid
              days={days!}
              today={today}
              byDay={byDay}
              selectedId={selectedId}
              reminded={reminded}
              focusedId={focusedId}
              ghost={ghost}
            />
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
