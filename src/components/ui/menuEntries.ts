import type { ReactNode } from 'react';

/**
 * Menus are described as data so the same entries can be shown from a "…"
 * button and from a right-click.
 */
export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Shows a check mark (for choices such as the current colour). */
      checked?: boolean;
      /** The action focuses something itself, so the menu shouldn't refocus its trigger. */
      movesFocus?: boolean;
      onSelect: () => void;
    }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'sub'; label: string; icon?: ReactNode; disabled?: boolean; entries: MenuEntries };

/** Falsy entries are skipped, so entries can be written as `cond && {...}`. */
export type MenuEntries = (MenuEntry | false | null | undefined)[];

/** Drops falsy entries, and separators that would be first, last or doubled. */
export function cleanEntries(entries: MenuEntries): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.kind === 'separator' && (!out.length || out[out.length - 1].kind === 'separator')) {
      continue;
    }
    out.push(entry);
  }
  while (out.length && out[out.length - 1].kind === 'separator') out.pop();
  return out;
}
