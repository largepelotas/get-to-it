import { format } from 'date-fns';
import { toast } from 'sonner';
import { homeView } from './commands';
import { formatTimestamp } from './lib/dates';
import {
  canBackUp,
  openBackupsFolder,
  openTextFile,
  saveFolder,
  saveTextFile,
  writeBackup,
} from './platform';
import { backUp } from './store/backup';
import { replaceData, useData } from './store/data';
import { markdownFiles } from './store/markdown';
import { seedIfNeeded } from './store/seed';
import {
  describeContents,
  ImportError,
  makeSnapshot,
  parseSnapshot,
  snapshotToJson,
} from './store/snapshot';
import { confirmAction, useUI } from './store/ui';

/*
 * Export, import and backups, as run from Settings and the command palette.
 */

const JSON_FILTER = { name: 'Checklist export', extensions: ['json'] };

const stamp = () => format(new Date(), 'yyyy-MM-dd');

function failed(what: string, err: unknown): void {
  console.error(what, err);
  toast.error(`${what}: ${err instanceof Error ? err.message : String(err)}`);
}

export async function exportJson(): Promise<void> {
  const { tables, settings } = useData.getState();
  try {
    const json = snapshotToJson(makeSnapshot(tables, settings));
    if (await saveTextFile(`Checklist ${stamp()}.json`, json, JSON_FILTER)) {
      toast(`Exported ${describeContents(tables)}`);
    }
  } catch (err) {
    failed('Export failed', err);
  }
}

export async function exportMarkdown(): Promise<void> {
  const { tables, settings } = useData.getState();
  try {
    const files = markdownFiles(tables, settings.groceryCategories);
    if (await saveFolder(`Checklist ${stamp()}`, files)) {
      toast(`Exported ${files.length === 1 ? '1 list' : `${files.length} lists`} as Markdown`);
    }
  } catch (err) {
    failed('Export failed', err);
  }
}

/** Picks an export file and, once confirmed, replaces everything with it. */
export async function importJson(): Promise<void> {
  let data: ReturnType<typeof parseSnapshot>;
  try {
    const json = await openTextFile(JSON_FILTER);
    if (json === null) return;
    data = parseSnapshot(json);
  } catch (err) {
    if (err instanceof ImportError) toast.error(`Can’t import this file. ${err.message}`);
    else failed('Import failed', err);
    return;
  }
  const from = data.exportedAt ? `, exported ${formatTimestamp(data.exportedAt)}` : '';
  confirmAction({
    title: 'Replace everything with this file?',
    message: `The file has ${describeContents(data.tables)}${from}. Everything in Checklist now will be replaced. ${
      canBackUp
        ? 'A backup of what’s here now is saved first.'
        : 'Export what’s here first if you might want it back.'
    }`,
    confirmLabel: 'Replace',
    danger: true,
    onConfirm: () => void applyImport(data),
  });
}

async function applyImport(data: ReturnType<typeof parseSnapshot>): Promise<void> {
  try {
    if (canBackUp) await backUp(writeBackup, new Date(), 'before-import');
    await replaceData(data, ['lastBackupAt']);
  } catch (err) {
    failed('Import failed', err);
    return;
  }
  // Makes sure there's a default list for quick-add.
  seedIfNeeded();
  useUI.setState({
    view: homeView(),
    selectedItemId: null,
    multiSelectedIds: [],
    detailsOpen: false,
    duePickerFor: null,
    deadlinePickerFor: null,
    renaming: null,
  });
  // Undo buttons on earlier toasts point at history that's gone.
  toast.dismiss();
  toast(`Imported ${describeContents(data.tables)}`);
}

export async function backUpNow(): Promise<void> {
  try {
    await backUp(writeBackup);
    toast('Backed up', {
      action: { label: 'Show', onClick: () => void openBackupsFolder().catch(console.error) },
    });
  } catch (err) {
    failed('Backup failed', err);
  }
}

export function showBackups(): void {
  openBackupsFolder().catch((err: unknown) => failed('Couldn’t open the backups folder', err));
}
