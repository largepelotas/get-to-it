import { format } from 'date-fns';
import { Trash, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trashItems } from '@/commands';
import { RichTextField } from '@/components/editor/RichTextField';
import { Heatmap } from '@/components/stats/Heatmap';
import { Button, IconButton, Select } from '@/components/ui';
import type { Item } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { formatTimestamp, fromDateKey, type DateKey } from '@/lib/dates';
import { setHabitGoal } from '@/store/actions/habits';
import { setItemNotes, setItemText } from '@/store/actions/items';
import { useData } from '@/store/data';
import { bestStreak, goalLabel, habitDayValues, sameGoal } from '@/store/habits';
import { heatmapWeeks } from '@/store/stats';
import { closeDetails, useUI } from '@/store/ui';
import { GOALS } from './habitMenu';
import { habitStatus } from './habitStatus';

const fullDay = (day: DateKey) => format(fromDateKey(day), 'd MMM yyyy');

/** Closes the panel from inside it, handing focus back to the habit's row. */
function closeToRow(id: string) {
  closeDetails();
  document.querySelector<HTMLElement>(`[role="listitem"][data-item-id="${id}"]`)?.focus();
}

function Figure({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-md bg-sidebar px-2.5 py-2">
      <dt className="truncate text-xs text-fg-muted">{label}</dt>
      <dd className="text-lg font-semibold text-fg tabular-nums">
        {value}
        {unit && ' '}
        {unit && <span className="ml-1 text-xs font-normal text-fg-muted">{unit}</span>}
      </dd>
    </div>
  );
}

function TitleField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      aria-label="Habit title"
      rows={1}
      value={draft ?? item.text}
      readOnly={readOnly}
      onChange={(e) => {
        const text = e.target.value.replace(/\n/g, ' ');
        setDraft(text);
        setItemText(item.id, text);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="field-sizing-content w-full resize-none rounded-md bg-transparent px-1 py-0.5 text-base font-semibold outline-none placeholder:text-fg-subtle focus:bg-hover"
    />
  );
}

export interface HabitDetailsProps {
  item: Item;
  readOnly: boolean;
}

/** The side panel for the selected habit: goal, streaks and a year of check-ins. */
export function HabitDetails({ item, readOnly }: HabitDetailsProps) {
  const checkIns = useData((s) => s.tables.checkIns);
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const today = useToday();
  const status = useMemo(
    () => habitStatus(item.habit, Object.values(checkIns), item.id, today, weekStartsOn),
    [item.habit, item.id, checkIns, today, weekStartsOn],
  );
  const best = useMemo(
    () => bestStreak(status.goal, status.days, weekStartsOn),
    [status, weekStartsOn],
  );
  const weeks = useMemo(() => heatmapWeeks(today, weekStartsOn), [today, weekStartsOn]);
  const values = useMemo(() => habitDayValues(status.days), [status.days]);
  const inYear = useMemo(() => {
    const shown = new Set(weeks.flat());
    return [...status.days].filter((d) => shown.has(d)).length;
  }, [weeks, status.days]);
  const unit = status.goal.period === 'day' ? 'days' : 'weeks';
  const goalIndex = GOALS.findIndex((g) => sameGoal(g, status.goal));

  return (
    <aside
      data-region="details"
      aria-label="Habit details"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) closeToRow(item.id);
      }}
      className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-surface"
    >
      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-1 px-3 pt-2">
        <div data-tauri-drag-region className="flex-1 self-stretch" />
        <IconButton
          label="Close details"
          shortcut="Escape"
          icon={<X className="size-4" />}
          onClick={() => closeToRow(item.id)}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
        <TitleField key={item.id} item={item} readOnly={readOnly} />

        <div>
          <label htmlFor="habit-goal" className="mb-1.5 block text-xs font-medium text-fg-muted">
            Goal
          </label>
          <Select
            id="habit-goal"
            value={goalIndex}
            disabled={readOnly}
            onChange={(e) => setHabitGoal(item.id, GOALS[Number(e.target.value)])}
          >
            {GOALS.map((goal, i) => (
              <option key={i} value={i}>
                {goalLabel(goal)}
              </option>
            ))}
          </Select>
        </div>

        <dl aria-label="Streaks" className="flex gap-2">
          <Figure label="Current streak" value={status.streak} unit={unit} />
          <Figure label="Best streak" value={best} unit={unit} />
          <Figure label="Check-ins" value={status.days.size} />
        </dl>

        <section>
          <h2 className="mb-1.5 text-xs font-medium text-fg-muted">Past year</h2>
          <Heatmap
            weeks={weeks}
            values={values}
            name={`${inYear} ${inYear === 1 ? 'check-in' : 'check-ins'} in the past year`}
            label={(day, value) =>
              value > 0 ? `Done on ${fullDay(day)}` : `Not done on ${fullDay(day)}`
            }
          />
        </section>

        <div>
          <h2 className="mb-1.5 text-xs font-medium text-fg-muted">Notes</h2>
          <RichTextField
            key={item.id}
            variant="compact"
            label="Notes"
            placeholder="Add notes"
            content={item.details}
            readOnly={readOnly}
            onChange={(doc) => setItemNotes(item.id, doc)}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-fg-subtle">
        <span className="min-w-0 flex-1 truncate">Created {formatTimestamp(item.createdAt)}</span>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete habit"
            className="text-danger"
            onClick={() => trashItems([item.id])}
          >
            <Trash aria-hidden className="size-3.5" />
            Delete
          </Button>
        )}
      </div>
    </aside>
  );
}

/** The selected habit's details, when the panel is open. */
export function HabitDetailsPanel({ listId }: { listId: string }) {
  const detailsOpen = useUI((s) => s.detailsOpen);
  const selectedId = useUI((s) => s.selectedItemId);
  const item = useData((s) => (selectedId ? s.tables.items[selectedId] : undefined));
  const list = useData((s) => (item ? s.tables.lists[item.listId] : undefined));
  if (!detailsOpen || !item || !list || item.deletedAt || item.listId !== listId) return null;
  return <HabitDetails item={item} readOnly={!!(list.deletedAt || list.archivedAt)} />;
}
