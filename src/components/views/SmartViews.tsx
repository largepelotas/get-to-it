import { CalendarDays, Sun } from 'lucide-react';
import { colorVar } from '@/lib/theme';
import { EmptyState, ViewHeader } from './ViewHeader';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Placeholder until M3 fills it with overdue and due-today tasks. */
export function TodayView() {
  return (
    <>
      <ViewHeader
        icon={<Sun className="size-6" style={{ color: colorVar('amber') }} />}
        title="Today"
        subtitle={dayFormat.format(new Date())}
      />
      <EmptyState title="Nothing due today">
        Tasks that are due today or overdue, from all your lists, will show here.
      </EmptyState>
    </>
  );
}

/** Placeholder until M3 fills it with future tasks grouped by day. */
export function UpcomingView() {
  return (
    <>
      <ViewHeader
        icon={<CalendarDays className="size-6" style={{ color: colorVar('red') }} />}
        title="Upcoming"
      />
      <EmptyState title="Nothing coming up">
        Tasks with future due dates will show here, grouped by day.
      </EmptyState>
    </>
  );
}
