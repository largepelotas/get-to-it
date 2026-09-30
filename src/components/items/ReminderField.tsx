import clsx from 'clsx';
import { AlarmClock, Bell, BellPlus, X } from 'lucide-react';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { remind } from '@/commands';
import { Button, IconButton, Input, Menu, type MenuEntries } from '@/components/ui';
import type { Item } from '@/data/types';
import { formatTimestamp } from '@/lib/dates';
import { describeReminder, fireTime, presetsFor } from '@/lib/reminders';
import { removeReminder } from '@/store/actions/reminders';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';

/** A picked moment from a datetime-local field, or null if incomplete. */
function parseLocal(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function CustomReminder({ item, onDone }: { item: Item; onDone: () => void }) {
  const allDayTime = useData((s) => s.settings.allDayReminderTime);
  const [value, setValue] = useState(() => {
    const date = item.dueDate ?? format(new Date(), 'yyyy-MM-dd');
    return `${date}T${item.dueTime ?? allDayTime}`;
  });
  const at = parseLocal(value);
  const submit = () => {
    if (at === null) return;
    remind(item.id, { kind: 'absolute', at });
    onDone();
  };
  return (
    <form
      className="mt-1 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        type="datetime-local"
        aria-label="Reminder date and time"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
        className="h-7 min-w-0 flex-1 px-1.5 text-xs"
      />
      <Button size="sm" variant="primary" type="submit" disabled={at === null}>
        Add
      </Button>
      <IconButton size="sm" label="Cancel" icon={<X className="size-3.5" />} onClick={onDone} />
    </form>
  );
}

/** The task's reminders, with presets relative to its due date and a custom moment. */
export function ReminderField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const all = useData((s) => s.tables.reminders);
  const allDayTime = useData((s) => s.settings.allDayReminderTime);
  const [custom, setCustom] = useState(false);
  const now = useNow();
  const reminders = useMemo(
    () =>
      Object.values(all)
        .filter((r) => r.itemId === item.id)
        .map((r) => ({ reminder: r, at: fireTime(r, item, allDayTime) }))
        .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity)),
    [all, item, allDayTime],
  );
  if (readOnly && !reminders.length) return null;

  const taken = new Set(
    reminders.filter((r) => r.reminder.kind === 'relative').map((r) => r.reminder.offsetMinutes),
  );
  const entries = (): MenuEntries => [
    item.dueDate
      ? { kind: 'label', label: item.dueTime ? 'Before the due time' : `At ${allDayTime}` }
      : { kind: 'label', label: 'Add a due date for these' },
    ...presetsFor(item).map((p) => ({
      label: p.label,
      checked: taken.has(p.offsetMinutes),
      disabled: !item.dueDate || taken.has(p.offsetMinutes),
      onSelect: () => remind(item.id, { kind: 'relative', offsetMinutes: p.offsetMinutes }),
    })),
    { kind: 'separator' },
    {
      label: 'Custom date and time…',
      icon: <AlarmClock className="size-3.5" />,
      movesFocus: true,
      onSelect: () => setCustom(true),
    },
  ];

  return (
    <div>
      <h3 className="mb-1.5 flex items-center text-xs font-medium text-fg-muted">
        <span className="flex-1">Reminders</span>
        {!readOnly && (
          <Menu
            align="end"
            entries={entries}
            trigger={
              <IconButton size="sm" label="Add reminder" icon={<BellPlus className="size-3.5" />} />
            }
          />
        )}
      </h3>
      {reminders.length > 0 && (
        <ul aria-label="Reminders" className="space-y-0.5">
          {reminders.map(({ reminder, at }) => {
            const passed = at === null || at <= now || item.checked;
            const snoozed = at !== null && reminder.snoozedUntil === at;
            const label = describeReminder(reminder, item);
            const detail =
              reminder.kind === 'relative' && !item.dueDate
                ? 'Needs a due date'
                : at === null
                  ? null
                  : snoozed
                    ? `Snoozed to ${formatTimestamp(at)}`
                    : reminder.kind === 'relative'
                      ? formatTimestamp(at)
                      : null;
            return (
              <li
                key={reminder.id}
                className="group flex min-h-7 items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-hover"
              >
                <Bell
                  aria-hidden
                  className={clsx('size-3.5 shrink-0', passed ? 'text-fg-subtle' : 'text-accent')}
                />
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate', passed && 'text-fg-subtle')}>
                    {label}
                  </span>
                  {detail && (
                    <span className="block truncate text-xs text-fg-subtle">{detail}</span>
                  )}
                </span>
                {!readOnly && (
                  <IconButton
                    size="sm"
                    label={`Remove reminder ${label}`}
                    tooltip={false}
                    icon={<X className="size-3.5" />}
                    onClick={() => removeReminder(reminder.id)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && custom && <CustomReminder item={item} onDone={() => setCustom(false)} />}
      {!readOnly && !reminders.length && !custom && (
        <p className="px-1 text-xs text-fg-subtle">
          {item.dueDate ? 'No reminders.' : 'Add a due date, or pick a custom time.'}
        </p>
      )}
    </div>
  );
}
