import { invoke } from '@tauri-apps/api/core';
import { LocalStorageRepository } from '@/data/localStorage';
import type { Repository } from '@/data/repository';
import { SqliteRepository, type SqlExecutor } from '@/data/sqlite';
import { isSafeUrl } from '@/lib/links';
import { BrowserScheduler, type ScheduledReminder } from './browserScheduler';

export type { ScheduledReminder };

/** True inside the desktop app, false in the browser preview. */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

const tauriExecutor: SqlExecutor = {
  select: (sql, params = []) => invoke('db_select', { sql, params }),
  batch: (statements) => invoke('db_batch', { statements }),
};

export function createRepository(): Repository {
  return isTauri ? new SqliteRepository(tauriExecutor) : new LocalStorageRepository();
}

/** Tells the desktop shell the first screen has rendered, so it can show the window. */
export async function appReady(): Promise<void> {
  if (isTauri) await invoke('app_ready');
}

/** Matches the native window chrome (title bar, traffic lights) to the app theme. */
export async function setWindowTheme(theme: 'light' | 'dark' | null): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTheme(theme);
}

/** Subscribes to a native event. Returns a function that unsubscribes, usable right away. */
function listenNative<T>(event: string, handler: (payload: T) => void): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;
  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<T>(event, (e) => handler(e.payload)))
    .then((fn) => {
      if (stopped) fn();
      else unlisten = fn;
    });
  return () => {
    stopped = true;
    unlisten?.();
  };
}

// Notifications and reminders

function showBrowserNotification(title: string, body: string): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

let browserScheduler: BrowserScheduler | null = null;
function getBrowserScheduler(): BrowserScheduler {
  browserScheduler ??= new BrowserScheduler(showBrowserNotification);
  return browserScheduler;
}

/** Hands the scheduler every reminder to fire, replacing what it had. */
export async function setReminderSchedule(entries: ScheduledReminder[]): Promise<void> {
  if (isTauri) await invoke('set_reminder_schedule', { entries });
  else getBrowserScheduler().replace(entries);
}

/** Called with each reminder the scheduler fires. Returns an unsubscribe function. */
export function onReminderFired(handler: (fired: { id: string; at: number }) => void): () => void {
  return isTauri
    ? listenNative('reminder://fired', handler)
    : getBrowserScheduler().onFired(handler);
}

/** Asks for permission to show notifications, if it hasn't been decided yet. */
export async function requestNotificationPermission(): Promise<void> {
  try {
    if (isTauri) {
      const { isPermissionGranted, requestPermission } =
        await import('@tauri-apps/plugin-notification');
      if (!(await isPermissionGranted())) await requestPermission();
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch (err) {
    console.error('Could not ask for notification permission', err);
  }
}

/** Shows a desktop notification right away. */
export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri) return showBrowserNotification(title, body);
  const { sendNotification } = await import('@tauri-apps/plugin-notification');
  sendNotification({ title, body });
}

// Links

/** Opens a web or email link in the default browser or mail app. Other links are ignored. */
export async function openUrl(url: string): Promise<void> {
  if (!isSafeUrl(url)) return;
  if (isTauri) {
    const opener = await import('@tauri-apps/plugin-opener');
    await opener.openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// App lifecycle

/** Whether closing the window hides it to the tray (true) or quits (false). */
export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (isTauri) await invoke('set_close_to_tray', { enabled });
}

/** Launch at login, or null where it isn't available (the browser). */
export async function getLaunchAtLogin(): Promise<boolean | null> {
  if (!isTauri) return null;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled();
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  await (enabled ? enable() : disable());
}

/** Called when the user quits (tray, Cmd+Q) so pending saves can finish first. */
export function onQuitRequested(handler: () => void): () => void {
  return isTauri ? listenNative('app://quit-requested', handler) : () => {};
}

export async function quitApp(): Promise<void> {
  if (isTauri) await invoke('quit_app');
}

export async function setTrayTooltip(text: string): Promise<void> {
  if (isTauri) await invoke('set_tray_tooltip', { text });
}

// Clipboard

export async function copyText(text: string): Promise<void> {
  if (isTauri) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

// Files: export, import and backups

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Offers a file for download in the browser preview. */
function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Asks where to save and writes the file. In the browser it downloads instead.
 * Returns false if the user cancelled.
 */
export async function saveTextFile(
  defaultName: string,
  contents: string,
  filter: FileFilter,
): Promise<boolean> {
  if (!isTauri) {
    download(
      defaultName,
      contents,
      filter.extensions[0] === 'json' ? 'application/json' : 'text/markdown',
    );
    return true;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: defaultName, filters: [filter] });
  if (!path) return false;
  await invoke('write_text_file', { path, contents });
  return true;
}

/** Asks for a file and reads it. Returns null if the user cancelled. */
export async function openTextFile(filter: FileFilter): Promise<string | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, directory: false, filters: [filter] });
    if (typeof path !== 'string') return null;
    return invoke<string>('read_text_file', { path });
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filter.extensions.map((e) => `.${e}`).join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void file.text().then(resolve, () => resolve(null));
      else resolve(null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Writes a set of files into a new folder named `folderName` inside a folder
 * the user picks. The browser preview downloads one combined file instead.
 * Returns false if the user cancelled.
 */
export async function saveFolder(
  folderName: string,
  files: { path: string; contents: string }[],
): Promise<boolean> {
  if (!isTauri) {
    const combined = files.map((f) => f.contents.trim()).join('\n\n---\n\n');
    download(`${folderName}.md`, `${combined}\n`, 'text/markdown');
    return true;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const dir = await open({ directory: true, multiple: false, title: 'Choose where to export' });
  if (typeof dir !== 'string') return false;
  await invoke('write_files', {
    dir,
    files: files.map((f) => ({ path: `${folderName}/${f.path}`, contents: f.contents })),
  });
  return true;
}

/** True where automatic backups are written (the desktop app). */
export const canBackUp = isTauri;

/** Writes a backup into the app's backups folder, keeping the newest `keep`. */
export async function writeBackup(name: string, contents: string, keep: number): Promise<void> {
  if (isTauri) await invoke('write_backup', { name, contents, keep });
}

export async function openBackupsFolder(): Promise<void> {
  if (isTauri) await invoke('open_backups_folder');
}
