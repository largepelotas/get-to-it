import { useEffect, useSyncExternalStore } from 'react';
import { applyTheme, resolveTheme, watchSystemTheme, type ResolvedTheme } from '@/lib/theme';
import { setWindowTheme } from '@/platform';
import { useData } from '@/store/data';

/** The theme in use right now, following the OS when the setting is "system". */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useData((s) => s.settings.theme);
  return useSyncExternalStore(watchSystemTheme, () => resolveTheme(preference));
}

/** Keeps <html data-theme> and the native window chrome in step with the setting. */
export function useApplyTheme(): void {
  const preference = useData((s) => s.settings.theme);
  const theme = useResolvedTheme();
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    void setWindowTheme(preference === 'system' ? null : preference).catch(() => {});
  }, [preference]);
}
