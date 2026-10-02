import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { quitWhenSaved } from '@/dataCommands';
import { onQuitRequested, setCloseToTray, setTrayStatus } from '@/platform';
import { useData } from '@/store/data';
import { stopTimer, useFocus } from '@/store/focus';
import { trayStatus } from '@/lib/focus';
import { dueRows, todayCount } from '@/store/smart';
import { useFocusClock } from './useFocusClock';
import { useReminderEntries } from './useReminders';
import { useToday } from './useToday';

const SAVE_ERROR_TOAST = 'save-error';

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
        // Log the running timer before the final save.
        stopTimer();
        void quitWhenSaved();
      }),
    [],
  );

  // A save that fails is tried again by itself, but say so: the only other sign
  // is an icon in the sidebar, which may be hidden.
  const saveFailing = useData((s) => s.saveError !== null);
  useEffect(() => {
    if (!saveFailing) {
      toast.dismiss(SAVE_ERROR_TOAST);
      return;
    }
    toast.error('Changes aren’t being saved', {
      id: SAVE_ERROR_TOAST,
      description: 'Checklist will keep trying. Don’t quit until this goes away.',
      duration: Infinity,
    });
  }, [saveFailing]);

  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const today = useToday();
  const dueToday = useMemo(() => todayCount(dueRows(items, lists), today), [items, lists, today]);
  const unread = useReminderEntries().inbox.length;
  const timer = useFocus((s) => s.timer);
  const taskName = useData((s) => (timer?.itemId ? s.tables.items[timer.itemId]?.text : undefined));
  const clock = useFocusClock();
  // Only changes while a timer runs, so an idle tray isn't re-sent on every focus event.
  const tick = timer ? clock : 0;
  useEffect(() => {
    const parts = [
      dueToday && `${dueToday} due today`,
      unread && (unread === 1 ? '1 reminder' : `${unread} reminders`),
    ].filter((p): p is string => !!p);
    const { title, tooltip } = trayStatus(parts, timer, tick, taskName);
    void setTrayStatus(tooltip, title).catch(console.error);
  }, [dueToday, unread, timer, taskName, tick]);
}
