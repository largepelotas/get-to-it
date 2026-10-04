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
  { value: 'graphite', label: 'Graphite' },
  { value: 'paper', label: 'Paper' },
  { value: 'moss', label: 'Moss' },
  { value: 'plum', label: 'Plum' },
  { value: 'contrast', label: 'High contrast' },
];

export function isPaletteName(value: unknown): value is PaletteName {
  return PALETTE_NAMES.includes(value as PaletteName);
}

/** Palettes that were renamed or removed, and the current one each became. */
export const LEGACY_PALETTES: Record<string, PaletteName> = {
  stone: 'moss',
  sage: 'moss',
  dusk: 'plum',
  midnight: 'graphite',
};

/** A stored palette name as a current one: old names map over, anything else is undefined. */
export function resolvePaletteName(value: unknown): PaletteName | undefined {
  if (isPaletteName(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(LEGACY_PALETTES, value)) {
    return LEGACY_PALETTES[value];
  }
  return undefined;
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
