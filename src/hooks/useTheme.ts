import { useEffect, useSyncExternalStore } from 'react';
import {
  applyPalette,
  applyTheme,
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from '@/lib/theme';
import { setWindowTheme } from '@/platform';
import { useData } from '@/store/data';

/** The theme in use right now, following the OS when the setting is "system". */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useData((s) => s.settings.theme);
  return useSyncExternalStore(watchSystemTheme, () => resolveTheme(preference));
}

/** Keeps <html data-theme>, <html data-palette> and the native window chrome in step with the settings. */
export function useApplyTheme(): void {
  const preference = useData((s) => s.settings.theme);
  const palette = useData((s) => s.settings.palette);
  const theme = useResolvedTheme();
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyPalette(palette), [palette]);
  useEffect(() => {
    void setWindowTheme(preference === 'system' ? null : preference).catch(() => {});
  }, [preference]);
}
