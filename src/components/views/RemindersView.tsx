import clsx from 'clsx';
import { AlarmClock, Bell, BellRing, Check, X } from 'lucide-react';
import { completeFromReminder, dismiss, snooze } from '@/commands';
import { DetailsPanel } from '@/components/items/DetailsPanel';
import { Button, IconButton, Menu } from '@/components/ui';
import { useReminderEntries } from '@/hooks/useReminders';
import { formatTimestamp } from '@/lib/dates';
import {
  describeReminder,
  SNOOZE_LABEL,
  type ReminderEntry,
  type SnoozeChoice,
} from '@/lib/reminders';
import { colorVar } from '@/lib/theme';
import { openDetails, useUI } from '@/store/ui';
import { EmptyState, ViewHeader } from './ViewHeader';

const SNOOZE_CHOICES: SnoozeChoice[] = ['10m', '1h', 'tomorrow'];

function ReminderRow({ entry, inbox }: { entry: ReminderEntry; inbox: boolean }) {
  const { reminder, item, list, at } = entry;
  const selected = useUI((s) => s.detailsOpen && s.selectedItemId === item.id);
  const snoozed = reminder.snoozedUntil === at;
  return (
    <li
      aria-label={item.text}
      className={clsx(
        'group flex items-center gap-3 rounded-md px-2 py-1.5',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      <Bell
        aria-hidden
        className={clsx('size-4 shrink-0', inbox ? 'text-accent' : 'text-fg-subtle')}
      />
      <button
        type="button"
        onClick={() => openDetails(item.id)}
        className="min-w-0 flex-1 rounded-sm text-left"
      >
        <span className="block truncate text-sm text-fg">{item.text}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: colorVar(list.color ?? 'gray') }}
          />
          <span className="truncate">{list.title}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">
            {formatTimestamp(at)}
            {snoozed ? ' (snoozed)' : ` · ${describeReminder(reminder, item)}`}
          </span>
          {reminder.constant && (
            <>
              <span aria-hidden>·</span>
              <span className="flex shrink-0 items-center gap-1">
                <BellRing aria-hidden className="size-3" />
                Repeats
              </span>
            </>
          )}
        </span>
      </button>
      {inbox && (
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label="Complete"
            icon={<Check className="size-4" />}
            onClick={() => completeFromReminder(reminder.id, item.id)}
          />
          <Menu
            align="end"
            entries={[
              { kind: 'label', label: 'Snooze for' },
              ...SNOOZE_CHOICES.map((choice) => ({
                label: SNOOZE_LABEL[choice],
                onSelect: () => snooze(reminder.id, choice),
              })),
            ]}
            trigger={<IconButton label="Snooze" icon={<AlarmClock className="size-4" />} />}
          />
          <IconButton
            label="Dismiss"
            icon={<X className="size-4" />}
            onClick={() => dismiss([reminder.id])}
          />
        </div>
      )}
    </li>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="mt-4 first:mt-0">
      <h2 className="mb-1 flex h-7 items-center gap-2 border-b border-line px-2 text-[13px] font-semibold">
        <span className="flex-1">{title}</span>
        {actions}
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

/** Delivered reminders to act on, then the ones still to come. */
export function RemindersView() {
  const { all, inbox } = useReminderEntries();
  const upcoming = all.filter((e) => e.state === 'scheduled');

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ViewHeader
          icon={<Bell className="size-6" style={{ color: colorVar('purple') }} />}
          title="Reminders"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-8 pb-10">
            {inbox.length > 0 && (
              <Section
                title="Reminded"
                actions={
                  inbox.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs font-medium text-accent"
                      onClick={() => dismiss(inbox.map((e) => e.reminder.id))}
                    >
                      Dismiss all
                    </Button>
                  )
                }
              >
                {inbox.map((e) => (
                  <ReminderRow key={e.reminder.id} entry={e} inbox />
                ))}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="Coming up">
                {upcoming.map((e) => (
                  <ReminderRow key={e.reminder.id} entry={e} inbox={false} />
                ))}
              </Section>
            )}
            {!inbox.length && !upcoming.length && (
              <EmptyState icon={<Bell className="size-8" />} title="No reminders">
                Add a reminder to a task from its details. Reminders that go off stay here until you
                complete, snooze or dismiss them.
              </EmptyState>
            )}
          </div>
        </div>
      </div>
      <DetailsPanel />
    </div>
  );
}
