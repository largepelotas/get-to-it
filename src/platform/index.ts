import { invoke } from '@tauri-apps/api/core';
import { LocalStorageRepository } from '@/data/localStorage';
import type { Repository } from '@/data/repository';
import { SqliteRepository, type SqlExecutor } from '@/data/sqlite';
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
