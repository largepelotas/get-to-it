import { PALETTE_NAMES, type ColorName, type PaletteName, type Settings } from '@/data/types';

export type ThemePreference = Settings['theme'];
export type ResolvedTheme = 'light' | 'dark';

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function systemTheme(): ResolvedTheme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/** Sets `data-theme` on <html>, which switches every design token. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/** The colour schemes in the order Settings offers them, with their names. */
export const PALETTES: { value: PaletteName; label: string }[] = [
  { value: 'graphite', label: 'Graphite and cobalt' },
  { value: 'stone', label: 'Stone and moss' },
  { value: 'sage', label: 'Sage study' },
  { value: 'midnight', label: 'Midnight ink' },
  { value: 'dusk', label: 'Dusk' },
];

export function isPaletteName(value: unknown): value is PaletteName {
  return PALETTE_NAMES.includes(value as PaletteName);
}

/** Sets `data-palette` on <html>, which picks the colour scheme. Graphite is the stylesheet's default. */
export function applyPalette(palette: PaletteName): void {
  const root = document.documentElement;
  if (isPaletteName(palette) && palette !== 'graphite') root.dataset.palette = palette;
  else delete root.dataset.palette;
}

/** Calls `onChange` when the OS switches between light and dark. Returns an unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** CSS colour for a list/folder colour name, following the current theme. */
export function colorVar(color: ColorName | null | undefined): string | undefined {
  return color ? `var(--list-${color})` : undefined;
}

export const COLOR_LABEL: Record<ColorName, string> = {
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  indigo: 'Indigo',
  purple: 'Purple',
  pink: 'Pink',
  gray: 'Grey',
};
