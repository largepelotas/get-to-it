import clsx from 'clsx';
import { format } from 'date-fns';
import { ChartColumn } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Heatmap } from '@/components/stats/Heatmap';
import { Button } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { fromDateKey, type DateKey } from '@/lib/dates';
import { formatFocusTotal } from '@/lib/focus';
import { colorVar } from '@/lib/theme';
import { completedEntries } from '@/store/completed';
import { useData } from '@/store/data';
import { doneByDay, focusByDay, heatmapWeeks, lastDays, summary } from '@/store/stats';
import { ViewHeader } from './ViewHeader';

const CHART_DAYS = 14;
const BAR_AREA_PX = 72;

const tasks = (n: number) => (n === 1 ? '1 task' : `${n} tasks`);
const focus = (seconds: number) => (seconds > 0 ? formatFocusTotal(seconds) : '0 min');
const longDay = (day: DateKey) => format(fromDateKey(day), 'EEE d MMM');
const fullDay = (day: DateKey) => format(fromDateKey(day), 'd MMM yyyy');

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-lg border border-line px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={name}>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">{name}</h3>
      <dl className="flex gap-3">{children}</dl>
    </div>
  );
}

/** A bar chart of the last days. The bars are decoration; the list items say the same in words. */
function BarChart({
  name,
  days,
  today,
  values,
  say,
}: {
  name: string;
  days: DateKey[];
  today: DateKey;
  values: Map<DateKey, number>;
  say: (value: number) => string;
}) {
  const max = Math.max(0, ...days.map((d) => values.get(d) ?? 0));
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">{name}</h3>
      <ul aria-label={name} className="flex gap-1.5">
        {days.map((day) => {
          const value = values.get(day) ?? 0;
          const text = `${longDay(day)}: ${say(value)}`;
          return (
            <li
              key={day}
              title={text}
              aria-current={day === today ? 'date' : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="sr-only">{text}</span>
              <div
                aria-hidden
                className="flex w-full items-end rounded-sm"
                style={{ height: BAR_AREA_PX }}
              >
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: max > 0 ? Math.max(2, (value / max) * BAR_AREA_PX) : 2,
                    background: value > 0 ? 'var(--accent)' : 'var(--line)',
                  }}
                />
              </div>
              <span
                aria-hidden
                className={clsx(
                  'text-[10px]',
                  day === today ? 'font-bold text-accent' : 'text-fg-muted',
                )}
              >
                {format(fromDateKey(day), 'EEEEE')}
                {day === today && <span className="block text-center leading-none">•</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type HeatKind = 'tasks' | 'focus';

/** Tasks done and focus time: figures, the last two weeks, and a heatmap of the past year. */
export function StatsView() {
  const today = useToday();
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const completions = useData((s) => s.tables.completions);
  const sessions = useData((s) => s.tables.focusSessions);
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const [heat, setHeat] = useState<HeatKind>('tasks');

  const done = useMemo(
    () => doneByDay(completedEntries({ items, lists, completions })),
    [items, lists, completions],
  );
  const focused = useMemo(() => focusByDay(Object.values(sessions)), [sessions]);
  const figures = useMemo(
    () => summary(done, focused, today, weekStartsOn),
    [done, focused, today, weekStartsOn],
  );
  const days = useMemo(() => lastDays(today, CHART_DAYS), [today]);
  const weeks = useMemo(() => heatmapWeeks(today, weekStartsOn), [today, weekStartsOn]);

  const values = heat === 'tasks' ? done : focused;
  const say = heat === 'tasks' ? tasks : focus;
  const heatName = useMemo(() => {
    let total = 0;
    let best = 0;
    let bestDay: DateKey | null = null;
    for (const week of weeks) {
      for (const day of week) {
        if (!day) continue;
        const n = values.get(day) ?? 0;
        total += n;
        if (n > best) {
          best = n;
          bestDay = day;
        }
      }
    }
    if (!bestDay) {
      return heat === 'tasks'
        ? 'No tasks completed in the past year'
        : 'No focus time in the past year';
    }
    const what = heat === 'tasks' ? `${tasks(total)} completed` : `${focus(total)} of focus time`;
    const busiest = heat === 'tasks' ? String(best) : focus(best);
    return `${what} in the past year, busiest day ${busiest} on ${fullDay(bestDay)}`;
  }, [weeks, values, heat]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={<ChartColumn className="size-6" style={{ color: colorVar('teal') }} />}
        title="Statistics"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="max-w-3xl">
          <section aria-labelledby="stats-summary">
            <h2 id="stats-summary" className="mb-3 text-base font-semibold">
              Summary
            </h2>
            <div className="flex flex-col gap-4">
              <Group name="Tasks done">
                <Figure label="Today" value={String(figures.doneToday)} />
                <Figure label="This week" value={String(figures.doneThisWeek)} />
                <Figure label="All time" value={String(figures.doneTotal)} />
              </Group>
              <Group name="Focus time">
                <Figure label="Today" value={focus(figures.focusToday)} />
                <Figure label="This week" value={focus(figures.focusThisWeek)} />
                <Figure label="All time" value={focus(figures.focusTotal)} />
              </Group>
            </div>
          </section>

          <section aria-labelledby="stats-days" className="mt-8">
            <h2 id="stats-days" className="mb-3 text-base font-semibold">
              Last 14 days
            </h2>
            <div className="flex flex-col gap-5">
              <BarChart
                name="Tasks done per day"
                days={days}
                today={today}
                values={done}
                say={tasks}
              />
              <BarChart
                name="Focus time per day"
                days={days}
                today={today}
                values={focused}
                say={focus}
              />
            </div>
          </section>

          <section aria-labelledby="stats-year" className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="stats-year" className="text-base font-semibold">
                Past year
              </h2>
              <div role="group" aria-label="Show in heatmap" className="flex items-center gap-0.5">
                {(
                  [
                    ['tasks', 'Tasks'],
                    ['focus', 'Focus time'],
                  ] as const
                ).map(([value, text]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant="ghost"
                    aria-pressed={heat === value}
                    className={clsx(heat === value && 'bg-selected font-medium')}
                    onClick={() => setHeat(value)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            </div>
            <Heatmap
              weeks={weeks}
              values={values}
              name={heatName}
              label={(day, value) =>
                value > 0
                  ? `${say(value)} on ${fullDay(day)}`
                  : `${heat === 'tasks' ? 'No tasks' : 'No focus time'} on ${fullDay(day)}`
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}
