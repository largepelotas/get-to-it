import { useEffect, useMemo } from 'react';
import { onQuitRequested, quitApp, setCloseToTray, setTrayTooltip } from '@/platform';
import { flushWrites, useData } from '@/store/data';
import { dueRows, todayCount } from '@/store/smart';
import { useReminderEntries } from './useReminders';
import { useToday } from './useToday';

/**
 * Desktop shell wiring: close-to-tray follows the setting, quitting waits
 * for pending saves, and the tray tooltip says what's due today.
 */
export function useAppLifecycle(): void {
  const closeToTray = useData((s) => s.settings.closeToTray);
  useEffect(() => {
    void setCloseToTray(closeToTray).catch(console.error);
  }, [closeToTray]);

  useEffect(
    () =>
      onQuitRequested(() => {
        void flushWrites().finally(() => void quitApp());
      }),
    [],
  );

  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const today = useToday();
  const dueToday = useMemo(() => todayCount(dueRows(items, lists), today), [items, lists, today]);
  const unread = useReminderEntries().inbox.length;
  useEffect(() => {
    const parts = [
      dueToday && `${dueToday} due today`,
      unread && (unread === 1 ? '1 reminder' : `${unread} reminders`),
    ].filter(Boolean);
    void setTrayTooltip(parts.length ? `Checklist · ${parts.join(', ')}` : 'Checklist').catch(
      console.error,
    );
  }, [dueToday, unread]);
}
