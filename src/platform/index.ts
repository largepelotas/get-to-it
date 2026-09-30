import { invoke } from '@tauri-apps/api/core';
import { LocalStorageRepository } from '@/data/localStorage';
import type { Repository } from '@/data/repository';
import { SqliteRepository, type SqlExecutor } from '@/data/sqlite';

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
