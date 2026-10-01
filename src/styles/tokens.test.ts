import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_NAMES, PALETTE_NAMES, type PaletteName } from '@/data/types';
import { PALETTES } from '@/lib/theme';

/*
 * Parses the design tokens in index.css and checks WCAG AA contrast for every
 * text colour on every surface and wash it's used on, and 3:1 for control
 * borders, the focus ring and list colours, in every palette and both themes. Fails if a colour edit breaks AA or a palette leaves out a
 * token (which would let Graphite's colour show through).
 */

const css = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8');

type Theme = 'light' | 'dark';

// Graphite is the default, so its rules are the bare :root ones. Selectors end
// in " {" so the light rule never matches the longer dark one.
function selector(palette: PaletteName, theme: Theme): string {
  const root = palette === 'graphite' ? ':root' : `:root[data-palette='${palette}']`;
  return theme === 'light' ? `${root} {` : `${root}[data-theme='dark'] {`;
}

/** Every declaration in the rule starting at `selector`, name -> value. */
function decls(sel: string): Record<string, string> {
  const start = css.indexOf(sel);
  if (start < 0) throw new Error(`missing ${sel}`);
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A translucent `rgb(r g b / a)` wash composited over an opaque surface, as hex. */
function wash(rgba: string, surface: string): string {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];
  const under = rgb(surface);
  return (
    '#' +
    [r, g, b]
      .map((v, i) =>
        Math.round(v * a + under[i]! * (1 - a))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = ['surface', 'sidebar', 'elevated'];
const texts = ['fg', 'fg-muted', 'fg-subtle', 'accent', 'danger'];
// Hovered and selected rows, highlighted search matches and soft buttons lay
// a wash over the surface; text on them must still meet AA.
const washes = ['hover', 'selected', 'accent-soft', 'danger-soft'];

// Non-text contrast (WCAG 1.4.11, 3:1): control borders and the focus ring
// (an accent outline) against every surface and row wash they sit on.
const controls = ['line-control', 'accent'];

const CASES = PALETTE_NAMES.flatMap((p) =>
  (['light', 'dark'] as const).map((theme) => [p, theme] as const),
);

describe.each(CASES)('%s %s', (palette, theme) => {
  const t = decls(selector(palette, theme));
  const v = (name: string) => t[`--${name}`]!;

  for (const s of surfaces)
    for (const x of texts) {
      it(`${x} on ${s} meets 4.5:1`, () => {
        expect(contrast(v(x), v(s))).toBeGreaterThanOrEqual(4.5);
      });
      for (const w of washes)
        it(`${x} on ${w} over ${s} meets 4.5:1`, () => {
          expect(contrast(v(x), wash(v(w), v(s)))).toBeGreaterThanOrEqual(4.5);
        });
    }

  for (const x of controls)
    for (const s of surfaces) {
      it(`${x} on ${s} meets 3:1 (non-text)`, () => {
        expect(contrast(v(x), v(s))).toBeGreaterThanOrEqual(3);
      });
      for (const w of ['hover', 'selected'])
        it(`${x} on ${w} over ${s} meets 3:1 (non-text)`, () => {
          expect(contrast(v(x), wash(v(w), v(s)))).toBeGreaterThanOrEqual(3);
        });
    }

  // List colours are set once per theme, but sit on every palette's surfaces:
  // icons, swatches and priority rings, on plain, hovered and selected rows.
  const lists = decls(theme === 'light' ? ':root {' : ":root[data-theme='dark'] {");
  for (const name of COLOR_NAMES)
    it(`list colour ${name} meets 3:1 (non-text) on every surface and wash`, () => {
      const c = lists[`--list-${name}`]!;
      for (const s of surfaces) {
        expect(contrast(c, v(s))).toBeGreaterThanOrEqual(3);
        for (const w of ['hover', 'selected'])
          expect(contrast(c, wash(v(w), v(s)))).toBeGreaterThanOrEqual(3);
      }
    });

  for (const [fg, bg] of [
    ['accent-fg', 'accent'],
    ['accent-fg', 'accent-hover'],
    ['danger-fg', 'danger'],
    ['danger-fg', 'danger-hover'],
  ])
    it(`${fg} on ${bg} meets 4.5:1`, () => {
      expect(contrast(v(fg!), v(bg!))).toBeGreaterThanOrEqual(4.5);
    });

  it('declares every colour token Graphite does (except list colours) and its color-scheme', () => {
    const names = (d: Record<string, string>) =>
      Object.keys(d)
        .filter((k) => k.startsWith('--') && !k.startsWith('--list-'))
        .sort();
    const want = names(decls(selector('graphite', 'light')));
    expect(want.length).toBeGreaterThan(15);
    expect(names(t)).toEqual(want);
    expect(t['color-scheme']).toBe(theme);
  });
});

describe('palettes', () => {
  it('Settings offers each palette the stylesheet defines, once', () => {
    expect(PALETTES.map((p) => p.value).sort()).toEqual([...PALETTE_NAMES].sort());
    const inCss = [...css.matchAll(/data-palette='(\w+)'\] \{/g)].map((m) => m[1]);
    expect(inCss.sort()).toEqual(PALETTE_NAMES.filter((p) => p !== 'graphite').sort());
  });

  it('keep the list colours the same in every palette', () => {
    for (const p of PALETTE_NAMES.filter((name) => name !== 'graphite'))
      for (const theme of ['light', 'dark'] as const)
        expect(Object.keys(decls(selector(p, theme))).some((k) => k.startsWith('--list-'))).toBe(
          false,
        );
  });
});
