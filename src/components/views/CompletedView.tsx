import { CircleCheck, Repeat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { revealItem, toggleItem } from '@/commands';
import { Checkbox } from '@/components/items/Checkbox';
import { Button } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { addDaysKey, formatLongDate, formatTime, toTimeString, type DateKey } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { completedEntries, groupByDay, type CompletedEntry } from '@/store/completed';
import { useData } from '@/store/data';
import { EmptyState, ViewHeader } from './ViewHeader';

/** How many days Completed shows at first, and how many more each "Show earlier" adds. */
const PAGE_DAYS = 30;

const plural = (n: number) => (n === 1 ? '1 task' : `${n} tasks`);

/** "Today", "Yesterday", otherwise "Wednesday, September 30" like Upcoming. */
function dayTitle(day: DateKey, today: DateKey): string {
  if (day === today) return 'Today';
  if (day === addDaysKey(today, -1)) return 'Yesterday';
  return formatLongDate(day);
}

/** What a screen reader says after the task's name, in words. */
function describeEntry(entry: CompletedEntry, listTitle: string): string {
  const time = formatTime(toTimeString(new Date(entry.completedAt)));
  const lead =
    entry.kind === 'wontDo'
      ? `Won't do ${time}`
      : entry.kind === 'repeat'
        ? `Repeating task, completed ${time}`
        : `Completed ${time}`;
  return `${lead}. In ${listTitle}.`;
}

function EntryRow({ entry, listTitle }: { entry: CompletedEntry; listTitle: string }) {
  const time = formatTime(toTimeString(new Date(entry.completedAt)));
  const struck = entry.kind === 'wontDo';
  return (
    <li
      aria-label={entry.text}
      aria-description={describeEntry(entry, listTitle)}
      className="flex min-h-9 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover"
    >
      {entry.kind === 'repeat' ? (
        <Repeat aria-hidden className="size-4 shrink-0 text-fg-subtle" />
      ) : (
        <Checkbox
          checked
          wontDo={struck}
          label={entry.text}
          tabbable
          onChange={() => toggleItem(entry.itemId, false)}
        />
      )}
      <button
        type="button"
        onClick={() => revealItem(entry.itemId)}
        className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
      >
        <span className={struck ? 'text-fg-muted line-through' : undefined}>{entry.text}</span>
      </button>
      {struck && <span className="shrink-0 text-xs text-fg-subtle">Won’t do</span>}
      <span className="shrink-0 text-xs text-fg-subtle">{time}</span>
      <span className="max-w-40 shrink-0 truncate text-xs text-fg-muted">{listTitle}</span>
    </li>
  );
}

/** Every finished task across the to-do lists, by the day it was finished, newest first. */
export function CompletedView() {
  const today = useToday();
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const completions = useData((s) => s.tables.completions);
  const [days, setDays] = useState(PAGE_DAYS);

  const all = useMemo(
    () => completedEntries({ items, lists, completions }),
    [items, lists, completions],
  );
  const cutoff = addDaysKey(today, -(days - 1));
  const shown = useMemo(() => all.filter((e) => e.day >= cutoff), [all, cutoff]);
  const groups = useMemo(() => groupByDay(shown), [shown]);
  const hasOlder = all.length > shown.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={<CircleCheck className="size-6" style={{ color: colorVar('green') }} />}
        title="Completed"
        subtitle={all.length ? `${plural(shown.length)} in the last ${days} days` : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10">
        {all.length === 0 ? (
          <EmptyState title="Nothing finished yet.">
            Tasks you finish, from all your lists, show here.
          </EmptyState>
        ) : (
          <div className="px-2">
            {groups.map(({ day, entries }) => {
              const headingId = `completed-${day}`;
              return (
                <section key={day} aria-labelledby={headingId} className="mt-4">
                  <h2
                    id={headingId}
                    className="flex items-baseline gap-2 border-b border-line pb-1 text-sm font-semibold"
                  >
                    {dayTitle(day, today)}
                    <span className="text-xs font-normal text-fg-subtle">{entries.length}</span>
                  </h2>
                  <ul>
                    {entries.map((entry) => (
                      <EntryRow
                        key={entry.key}
                        entry={entry}
                        listTitle={lists[entry.listId]?.title ?? ''}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {hasOlder && (
              <div className="mt-6 flex justify-center">
                <Button variant="ghost" onClick={() => setDays((d) => d + PAGE_DAYS)}>
                  Show earlier
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
