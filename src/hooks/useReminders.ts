import { useEffect, useMemo } from 'react';
import { announceDailyReview, announceFocusEnd, announceMissed } from '@/commands';
import { inboxEntries, reminderEntries, type ReminderEntry } from '@/lib/reminders';
import { onReminderFired, setReminderSchedule } from '@/platform';
import { useData } from '@/store/data';
import { finishTimer } from '@/store/focus';
import { useNow } from './useNow';
import { startReminderScheduler } from '@/store/reminderScheduler';

/** Runs the reminder scheduler while the app is mounted. */
export function useReminderScheduler(): void {
  useEffect(
    () =>
      startReminderScheduler({
        setSchedule: setReminderSchedule,
        onFired: onReminderFired,
        onMissed: announceMissed,
        onDailyReview: announceDailyReview,
        onFocusEnd: () => {
          const result = finishTimer();
          if (result) announceFocusEnd(result);
        },
      }),
    [],
  );
}

/** Every reminder with a fire time, soonest first, plus the inbox (delivered, not dismissed). */
export function useReminderEntries(): { all: ReminderEntry[]; inbox: ReminderEntry[] } {
  const reminders = useData((s) => s.tables.reminders);
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const allDayTime = useData((s) => s.settings.allDayReminderTime);
  const now = useNow();
  return useMemo(() => {
    const all = reminderEntries({ reminders, items, lists }, allDayTime, now);
    return { all, inbox: inboxEntries(all) };
  }, [reminders, items, lists, allDayTime, now]);
}

/** Tasks with a reminder still to go off, for the bell on their rows. */
export function useItemsWithReminders(): Set<string> {
  const { all } = useReminderEntries();
  return useMemo(
    () => new Set(all.filter((e) => e.state === 'scheduled').map((e) => e.item.id)),
    [all],
  );
}
