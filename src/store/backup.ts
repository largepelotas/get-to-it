import { format } from 'date-fns';
import { flushWrites, setSetting, useData } from './data';
import { makeSnapshot, snapshotToJson } from './snapshot';

/*
 * Automatic backups: once a day, a full JSON export goes into the backups
 * folder in the app's data folder. The newest `BACKUPS_KEPT` are kept.
 */

export const BACKUPS_KEPT = 14;

/** "gettoit-2026-09-30-221500.json". Names sort by age, which pruning relies on. */
export function backupName(now: Date, note?: string): string {
  return `gettoit-${format(now, 'yyyy-MM-dd-HHmmss')}${note ? `-${note}` : ''}.json`;
}

/** A backup is due when there's been none yet on this calendar day. */
export function backupDue(lastBackupAt: number | null, now: Date): boolean {
  if (lastBackupAt === null) return true;
  const last = new Date(lastBackupAt);
  return (
    last.getFullYear() !== now.getFullYear() ||
    last.getMonth() !== now.getMonth() ||
    last.getDate() !== now.getDate() ||
    lastBackupAt > now.getTime()
  );
}

export type BackupWriter = (name: string, contents: string, keep: number) => Promise<void>;

/** Writes a backup of everything saved so far and records when. */
export async function backUp(write: BackupWriter, now = new Date(), note?: string): Promise<void> {
  await flushWrites();
  const { tables, settings } = useData.getState();
  await write(
    backupName(now, note),
    snapshotToJson(makeSnapshot(tables, settings, now.getTime())),
    BACKUPS_KEPT,
  );
  if (!note) setSetting('lastBackupAt', now.getTime());
}

/** Backs up if backups are on and none has been made today. Returns whether it did. */
export async function backUpIfDue(write: BackupWriter, now = new Date()): Promise<boolean> {
  const { settings, ready } = useData.getState();
  if (!ready || !settings.backupsEnabled || !backupDue(settings.lastBackupAt, now)) return false;
  await backUp(write, now);
  return true;
}
