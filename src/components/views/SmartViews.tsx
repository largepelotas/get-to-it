import { CalendarDays, Sun } from 'lucide-react';
import { useMemo, useRef, type ReactNode } from 'react';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { QuickAdd } from '@/components/items/QuickAdd';
import { SmartList, type SmartSection } from '@/components/items/SmartList';
import { Button } from '@/components/ui';
import type { List } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, formatDateKey, formatLongDate } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { moveDueDates } from '@/store/actions/items';
import { useData } from '@/store/data';
import { dueRows, todayModel, upcomingModel } from '@/store/smart';
import { EmptyState, ViewHeader } from './ViewHeader';

const isLiveTodo = (list: List | undefined): list is List =>
  !!list && list.type === 'todo' && !list.deletedAt && !list.archivedAt;

/** Open, dated tasks from every live to-do list. */
function useDueRows() {
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  return useMemo(() => dueRows(items, lists), [items, lists]);
}

/** Where quick-add in Today and Upcoming puts tasks: the default list, else any live to-do list. */
function useQuickAddList(): List | null {
  const lists = useData((s) => s.tables.lists);
  const defaultId = useData((s) => s.settings.defaultListId);
  return useMemo(() => {
    const preferred = defaultId ? lists[defaultId] : undefined;
    if (isLiveTodo(preferred)) return preferred;
    return Object.values(lists).find(isLiveTodo) ?? null;
  }, [lists, defaultId]);
}

function SmartLayout({
  header,
  defaultDue,
  sections,
  empty,
}: {
  header: ReactNode;
  defaultDue: string;
  sections: SmartSection[];
  empty: ReactNode;
}) {
  const target = useQuickAddList();
  const quickAddRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pb-10">
            {target && (
              <div className="px-2">
                <QuickAdd
                  listId={target.id}
                  inputRef={quickAddRef}
                  defaultDue={defaultDue}
                  hint={target.title}
                  onArrowDown={() =>
                    listRef.current?.querySelector<HTMLElement>('[data-item-id]')?.focus()
                  }
                />
              </div>
            )}
            {sections.length ? (
              <div ref={listRef} className="mt-4 px-2">
                <SmartList sections={sections} onExitTop={() => quickAddRef.current?.focus()} />
              </div>
            ) : (
              empty
            )}
          </div>
        </div>
      </div>
      <DetailsPanel />
    </div>
  );
}

export function TodayView() {
  const today = useToday();
  const rows = useDueRows();
  const { overdue, today: dueToday } = useMemo(() => todayModel(rows, today), [rows, today]);

  const sections: SmartSection[] = [];
  if (overdue.length) {
    sections.push({
      key: 'Overdue',
      title: 'Overdue',
      tone: 'danger',
      rows: overdue,
      actions: (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs font-medium text-accent"
          onClick={() =>
            moveDueDates(
              overdue.map((r) => r.item.id),
              today,
            )
          }
        >
          Move to today
        </Button>
      ),
    });
  }
  if (dueToday.length) {
    sections.push({ key: 'Today', title: 'Today', rows: dueToday, timeOnly: true });
  }

  const count = overdue.length + dueToday.length;

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
                  </span>
                </>
              )}
            </>
          }
        />
      }
      defaultDue={today}
      sections={sections}
      empty={
        <EmptyState title="Nothing due today">
          Tasks due today or overdue, from all your lists, show here. Tasks you add here are due
          today.
        </EmptyState>
      }
    />
  );
}

export function UpcomingView() {
  const today = useToday();
  const rows = useDueRows();
  const groups = useMemo(() => upcomingModel(rows, today), [rows, today]);
  const sections: SmartSection[] = groups.map((group) => {
    const relative = formatDateKey(group.date);
    const long = formatLongDate(group.date);
    return {
      key: group.date,
      title: relative === 'Tomorrow' ? `Tomorrow · ${long}` : long,
      rows: group.rows,
      timeOnly: true,
    };
  });

  return (
    <SmartLayout
      header={
        <ViewHeader
          icon={<CalendarDays className="size-6" style={{ color: colorVar('red') }} />}
          title="Upcoming"
        />
      }
      defaultDue={addDaysKey(today, 1)}
      sections={sections}
      empty={
        <EmptyState title="Nothing coming up">
          Tasks with future due dates show here, grouped by day. Tasks you add here are due tomorrow
          unless you type a date.
        </EmptyState>
      }
    />
  );
}
