import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import clsx from 'clsx';
import {
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Sunrise,
  Sun,
} from 'lucide-react';
import { format } from 'date-fns';
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { moveTasksToDay, rescheduleTasks } from '@/commands';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { QuickAdd } from '@/components/items/QuickAdd';
import { SelectionBar } from '@/components/items/SelectionBar';
import { Board } from '@/components/items/Board';
import { SmartList, type SmartSection } from '@/components/items/SmartList';
import { Button, IconButton, Popover } from '@/components/ui';
import type { List, Priority } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import {
  addDaysKey,
  formatDateKey,
  formatDuration,
  formatLongDate,
  fromDateKey,
  startOfWeekKey,
  upcomingStart,
  weekDays,
  type DateKey,
} from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { groupRows, sortRows, type GroupContext } from '@/store/arrange';
import type { BoardColumn } from '@/store/board';
import { selectedIds, setUpcomingFrom, useUI, type View } from '@/store/ui';
import {
  countByDay,
  dueRows,
  next7Model,
  scheduledMinutes,
  todayModel,
  tomorrowModel,
  upcomingModel,
  type DueRow,
} from '@/store/smart';
import { EmptyState, ViewHeader } from './ViewHeader';
import { dateFromDropId, dayDropId } from './dayDrop';
import {
  groupChoices,
  SMART_SORTS,
  toSmartSections,
  useBoard,
  useViewOptions,
} from './arrangement';
import { ViewOptionsMenu } from './viewOptions';

// The calendar is only needed once Reschedule opens, so it loads separately.
const DateChoices = lazy(() =>
  import('@/components/items/DateChoices').then((m) => ({ default: m.DateChoices })),
);

/** Today's Overdue heading button: moves every overdue task to a day you pick. */
function RescheduleOverdue({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <Button size="sm" variant="ghost" className="h-6 text-xs font-medium text-accent">
          Reschedule
        </Button>
      }
    >
      <Suspense fallback={<div className="h-64 w-[252px]" />}>
        <DateChoices
          onPick={(date) => {
            setOpen(false);
            if (date) rescheduleTasks(ids, date);
          }}
        />
      </Suspense>
    </Popover>
  );
}

const isLiveTodo = (list: List | undefined): list is List =>
  !!list && list.type === 'todo' && !list.deletedAt && !list.archivedAt;

/** Open, dated tasks from every live to-do list. */
function useDueRows() {
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  return useMemo(() => dueRows(items, lists), [items, lists]);
}

/**
 * The view's sort and grouping, and the sections for a grouping other than
 * the view's own (`null` while the view groups its own way, with `sorted`
 * for ordering each of its sections).
 */
function useArrangement(view: View, rows: DueRow[]) {
  const { sort, group } = useViewOptions(view);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const sorted = useMemo(() => (rows: DueRow[]) => sortRows(rows, sort), [sort]);
  const sections = useMemo<SmartSection[] | null>(() => {
    if (group === 'default') return null;
    const ctx: GroupContext = { today, lists, labels };
    return toSmartSections(groupRows(sorted(rows), group, ctx));
  }, [group, rows, sorted, today, lists, labels]);
  return { sorted, sections };
}

/**
 * Where quick-add in Today and Upcoming puts tasks: the list asked for (a
 * filter's `#List`), else the default list, else any live to-do list.
 */
function useQuickAddList(wantedId?: string | null): List | null {
  const lists = useData((s) => s.tables.lists);
  const defaultId = useData((s) => s.settings.defaultListId);
  return useMemo(() => {
    const wanted = wantedId ? lists[wantedId] : undefined;
    if (isLiveTodo(wanted)) return wanted;
    const preferred = defaultId ? lists[defaultId] : undefined;
    if (isLiveTodo(preferred)) return preferred;
    return Object.values(lists).find(isLiveTodo) ?? null;
  }, [lists, defaultId, wantedId]);
}

export function SmartLayout({
  header,
  defaultDue,
  labelIds,
  listId,
  defaultPriority,
  sections,
  empty,
  grid,
  toolbar,
  draggable,
  board,
}: {
  header: ReactNode;
  /** Due date for tasks added here; none for a view that doesn't date them. */
  defaultDue?: string;
  /** Labels put on every task added here. */
  labelIds?: string[];
  /** Where tasks added here go, instead of the default list. */
  listId?: string | null;
  /** Priority for tasks added here whose text doesn't give one. */
  defaultPriority?: Priority;
  sections: SmartSection[];
  empty: ReactNode;
  /** Sections as boxes in two columns. */
  grid?: boolean;
  /** Shown above the quick-add field, scrolling with the content (Upcoming's week strip). */
  toolbar?: ReactNode;
  /** Rows can be dragged to sections that have a `dropId`. */
  draggable?: boolean;
  /** Columns to show as a board instead of the sections; `empty` isn't used while it is set. */
  board?: BoardColumn[] | null;
}) {
  const target = useQuickAddList(listId);
  // Room under the last row for the selection bar.
  const several = useUI((s) => s.multiSelectedIds.length >= 2);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={clsx('px-6', several ? 'pb-24' : 'pb-10')}>
              {toolbar}
              {target && (
                <div className="px-2">
                  <QuickAdd
                    listId={target.id}
                    inputRef={quickAddRef}
                    defaultDue={defaultDue}
                    labelIds={labelIds}
                    defaultPriority={defaultPriority}
                    hint={target.title}
                    onArrowDown={() =>
                      listRef.current?.querySelector<HTMLElement>('[data-item-id]')?.focus()
                    }
                  />
                </div>
              )}
              {board ? (
                <div ref={listRef} className="mt-4 px-2">
                  <Board columns={board} onExitTop={() => quickAddRef.current?.focus()} />
                </div>
              ) : sections.length ? (
                <div ref={listRef} className="mt-4 px-2">
                  <SmartList
                    sections={sections}
                    grid={grid}
                    draggable={draggable}
                    onExitTop={() => quickAddRef.current?.focus()}
                  />
                </div>
              ) : (
                empty
              )}
            </div>
          </div>
          <SelectionBar />
        </div>
      </div>
      <DetailsPanel />
    </div>
  );
}

const TODAY_VIEW: View = { kind: 'today' };
const TOMORROW_VIEW: View = { kind: 'tomorrow' };
const NEXT7_VIEW: View = { kind: 'next7' };
const UPCOMING_VIEW: View = { kind: 'upcoming' };

export function TodayView() {
  const today = useToday();
  const rows = useDueRows();
  const { overdue, today: dueToday } = useMemo(() => todayModel(rows, today), [rows, today]);
  const shown = useMemo(() => [...overdue, ...dueToday], [overdue, dueToday]);
  const { sorted, sections: grouped } = useArrangement(TODAY_VIEW, shown);
  const board = useBoard(TODAY_VIEW, shown);

  const sections: SmartSection[] = [];
  if (grouped) sections.push(...grouped);
  else {
    if (overdue.length) {
      sections.push({
        key: 'Overdue',
        title: 'Overdue',
        tone: 'danger',
        rows: sorted(overdue),
        actions: <RescheduleOverdue ids={overdue.map((r) => r.item.id)} />,
      });
    }
    if (dueToday.length) {
      sections.push({ key: 'Today', title: 'Today', rows: sorted(dueToday), timeOnly: true });
    }
  }

  const count = overdue.length + dueToday.length;
  const planned = scheduledMinutes(dueToday);

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={<Sun className="size-6" style={{ color: colorVar('amber') }} />}
          title="Today"
          subtitle={
            <>
              {formatLongDate(today)}
              {count > 0 && (
                <>
                  <span aria-hidden> · </span>
                  <span className="text-fg-subtle">
                    {count === 1 ? '1 task' : `${count} tasks`}
                    {planned > 0 && ` · ${formatDuration(planned)}`}
                  </span>
                </>
              )}
            </>
          }
          actions={
            <ViewOptionsMenu
              view={TODAY_VIEW}
              sorts={SMART_SORTS}
              groups={groupChoices('Overdue and today')}
            />
          }
        />
      }
      defaultDue={today}
      sections={sections}
      board={board}
      empty={
        <EmptyState title="Nothing due today">
          Tasks due today or overdue, from all your lists, show here. Tasks you add here are due
          today.
        </EmptyState>
      }
    />
  );
}

export function TomorrowView() {
  const today = useToday();
  const rows = useDueRows();
  const tomorrow = addDaysKey(today, 1);
  const dueTomorrow = useMemo(() => tomorrowModel(rows, today), [rows, today]);
  const { sorted, sections: grouped } = useArrangement(TOMORROW_VIEW, dueTomorrow);
  const board = useBoard(TOMORROW_VIEW, dueTomorrow);
  const sections: SmartSection[] =
    grouped ??
    (dueTomorrow.length
      ? [{ key: 'Tomorrow', title: 'Tomorrow', rows: sorted(dueTomorrow), timeOnly: true }]
      : []);
  const count = dueTomorrow.length;

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={<Sunrise className="size-6" style={{ color: colorVar('orange') }} />}
          title="Tomorrow"
          subtitle={
            <>
              {formatLongDate(tomorrow)}
              {count > 0 && (
                <>
                  <span aria-hidden> · </span>
                  <span className="text-fg-subtle">
                    {count === 1 ? '1 task' : `${count} tasks`}
                  </span>
                </>
              )}
            </>
          }
          actions={
            <ViewOptionsMenu view={TOMORROW_VIEW} sorts={SMART_SORTS} groups={groupChoices(null)} />
          }
        />
      }
      defaultDue={tomorrow}
      sections={sections}
      board={board}
      empty={
        <EmptyState title="Nothing due tomorrow">
          Tasks due tomorrow, from all your lists, show here. Tasks you add here are due tomorrow.
        </EmptyState>
      }
    />
  );
}

export function Next7View() {
  const today = useToday();
  const rows = useDueRows();
  const { overdue, days } = useMemo(() => next7Model(rows, today), [rows, today]);
  const shown = useMemo(() => [...overdue, ...days.flatMap((d) => d.rows)], [overdue, days]);
  const { sorted, sections: grouped } = useArrangement(NEXT7_VIEW, shown);
  const board = useBoard(NEXT7_VIEW, shown);

  const sections: SmartSection[] = [];
  if (grouped) sections.push(...grouped);
  else {
    if (overdue.length) {
      sections.push({
        key: 'Overdue',
        title: 'Overdue',
        tone: 'danger',
        rows: sorted(overdue),
        actions: <RescheduleOverdue ids={overdue.map((r) => r.item.id)} />,
      });
    }
    // Every day is shown, even without tasks, so the week can be read at a glance.
    for (const day of days) {
      const relative = formatDateKey(day.date);
      const long = formatLongDate(day.date);
      sections.push({
        key: day.date,
        title:
          day.date === today
            ? `Today · ${long}`
            : relative === 'Tomorrow'
              ? `Tomorrow · ${long}`
              : long,
        rows: sorted(day.rows),
        emptyText: 'Nothing due',
        timeOnly: true,
      });
    }
  }
  const count = overdue.length + days.reduce((sum, d) => sum + d.rows.length, 0);

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={<CalendarRange className="size-6" style={{ color: colorVar('green') }} />}
          title="Next 7 days"
          subtitle={
            count > 0 ? (
              <span className="text-fg-subtle">{count === 1 ? '1 task' : `${count} tasks`}</span>
            ) : undefined
          }
          actions={
            <ViewOptionsMenu view={NEXT7_VIEW} sorts={SMART_SORTS} groups={groupChoices('Day')} />
          }
        />
      }
      defaultDue={today}
      sections={sections}
      board={board}
      empty={grouped ? <EmptyState title="Nothing due in the next 7 days" /> : null}
    />
  );
}

/** One day of the week strip: weekday, number and task count; a drop target for dragged tasks. */
function StripDay({
  date,
  today,
  from,
  count,
}: {
  date: DateKey;
  today: DateKey;
  from: DateKey;
  count: number | undefined;
}) {
  const past = date < today;
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date, 'strip'), disabled: past });
  const day = fromDateKey(date);
  const current = date === from;
  const long = format(day, 'EEEE, MMMM d');
  const name = count ? `${long}, ${count === 1 ? '1 task' : `${count} tasks`}` : long;
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={name}
      aria-pressed={current}
      disabled={past}
      onClick={() => setUpcomingFrom(date === today ? null : date)}
      className={clsx(
        'flex h-14 flex-col items-center justify-center rounded-md text-xs transition-colors',
        current ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover',
        past && 'opacity-40',
        isOver && 'bg-hover ring-1 ring-accent',
      )}
    >
      <span className="text-fg-muted">{format(day, 'EEE')}</span>
      <span className={clsx('text-base', date === today && 'font-semibold text-accent')}>
        {format(day, 'd')}
      </span>
      <span
        aria-hidden
        className={clsx(
          'rounded-full px-1.5 text-[10px] leading-4',
          count ? 'bg-hover' : 'invisible',
        )}
      >
        {count ?? 0}
      </span>
    </button>
  );
}

/** Upcoming's seven-day strip for the week that holds `from`. */
function WeekStrip({ today, from, rows }: { today: DateKey; from: DateKey; rows: DueRow[] }) {
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const counts = useMemo(() => countByDay(rows), [rows]);
  return (
    <div role="group" aria-label="Week" className="mt-1 mb-3 grid grid-cols-7 gap-1 px-2">
      {weekDays(from, weekStartsOn).map((date) => (
        <StripDay key={date} date={date} today={today} from={from} count={counts.get(date)} />
      ))}
    </div>
  );
}

/** Upcoming's "Jump to a date" button: a calendar popover that sets where the view starts. */
function JumpToDate({ onPick }: { onPick: (date: DateKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={<IconButton label="Jump to a date" icon={<CalendarSearch className="size-4" />} />}
    >
      <Suspense fallback={<div className="h-64 w-[252px]" />}>
        <DateChoices
          onPick={(date) => {
            setOpen(false);
            if (date) onPick(date);
          }}
        />
      </Suspense>
    </Popover>
  );
}

export function UpcomingView() {
  const today = useToday();
  const rows = useDueRows();
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const upcomingFrom = useUI((s) => s.upcomingFrom);
  // A stored day that has slipped into the past counts as today.
  const from = upcomingStart(upcomingFrom, today);
  const { overdue, days } = useMemo(
    () => upcomingModel(rows, today, from, weekStartsOn),
    [rows, today, from, weekStartsOn],
  );
  const shown = useMemo(() => [...overdue, ...days.flatMap((d) => d.rows)], [overdue, days]);
  const { sorted, sections: grouped } = useArrangement(UPCOMING_VIEW, shown);
  const board = useBoard(UPCOMING_VIEW, shown);
  const group = useViewOptions(UPCOMING_VIEW).group;
  const [dragged, setDragged] = useState<DueRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const sections: SmartSection[] = [];
  if (grouped) sections.push(...grouped);
  else {
    if (overdue.length) {
      sections.push({
        key: 'Overdue',
        title: 'Overdue',
        tone: 'danger',
        rows: sorted(overdue),
        actions: <RescheduleOverdue ids={overdue.map((r) => r.item.id)} />,
      });
    }
    for (const day of days) {
      const relative = formatDateKey(day.date);
      const long = formatLongDate(day.date);
      sections.push({
        key: day.date,
        title:
          day.date === today
            ? `Today · ${long}`
            : relative === 'Tomorrow'
              ? `Tomorrow · ${long}`
              : long,
        rows: sorted(day.rows),
        emptyText: 'Nothing due',
        timeOnly: true,
        dropId: dayDropId(day.date),
      });
    }
  }

  const thisWeek = startOfWeekKey(today, weekStartsOn);
  const weekOfFrom = startOfWeekKey(from, weekStartsOn);
  const goTo = (date: DateKey) => setUpcomingFrom(date > today ? date : null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const date = over ? dateFromDropId(String(over.id)) : null;
    if (!date) return;
    const id = String(active.id);
    const selection = selectedIds();
    const ids = selection.length > 1 && selection.includes(id) ? selection : [id];
    moveTasksToDay(ids, date);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) =>
        setDragged(shown.find((r) => r.item.id === String(active.id)) ?? null)
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <SmartLayout
        header={
          <ViewHeader
            icon={<CalendarDays className="size-6" style={{ color: colorVar('red') }} />}
            title="Upcoming"
            subtitle={format(fromDateKey(from), 'MMMM yyyy')}
            actions={
              <>
                <IconButton
                  label="Previous week"
                  icon={<ChevronLeft className="size-4" />}
                  disabled={weekOfFrom <= thisWeek}
                  onClick={() => goTo(addDaysKey(weekOfFrom, -7))}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={from === today}
                  onClick={() => setUpcomingFrom(null)}
                >
                  Today
                </Button>
                <IconButton
                  label="Next week"
                  icon={<ChevronRight className="size-4" />}
                  onClick={() => goTo(addDaysKey(weekOfFrom, 7))}
                />
                <JumpToDate onPick={goTo} />
                <ViewOptionsMenu
                  view={UPCOMING_VIEW}
                  sorts={SMART_SORTS}
                  groups={groupChoices('Day')}
                />
              </>
            }
          />
        }
        toolbar={<WeekStrip today={today} from={from} rows={rows} />}
        defaultDue={from}
        sections={sections}
        board={board}
        draggable={group === 'default'}
        empty={<EmptyState title="Nothing coming up" />}
      />
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
