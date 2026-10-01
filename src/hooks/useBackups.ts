import { useEffect } from 'react';
import { toast } from 'sonner';
import { canBackUp, writeBackup } from '@/platform';
import { backUpIfDue } from '@/store/backup';

/** Wait after launch so the backup doesn't compete with startup. */
const FIRST_CHECK_MS = 15_000;
/** Checked hourly, so an app left running makes one each day. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Makes the daily automatic backup (desktop app only). */
export function useBackups(): void {
  useEffect(() => {
    if (!canBackUp) return;
    let failedBefore = false;
    const check = () => {
      backUpIfDue(writeBackup).then(
        () => (failedBefore = false),
        (err: unknown) => {
          console.error('Automatic backup failed', err);
          // Say so once, not every hour.
          if (!failedBefore)
            toast.error('The automatic backup failed. Try Back up now in Settings.');
          failedBefore = true;
        },
      );
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const every = setInterval(check, CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}
