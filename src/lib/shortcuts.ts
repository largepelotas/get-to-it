/**
 * Keyboard shortcuts written as `Mod+Shift+Z`. `Mod` is ⌘ on macOS and Ctrl
 * elsewhere. The key is compared case-insensitively against `event.key`.
 */
export type Shortcut = string;

interface Parsed {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parse(shortcut: Shortcut): Parsed {
  const parts = shortcut.split('+');
  const key = parts.pop() ?? '';
  const has = (name: string) => parts.includes(name);
  return { mod: has('Mod'), ctrl: has('Ctrl'), shift: has('Shift'), alt: has('Alt'), key };
}

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchesShortcut(event: KeyLike, shortcut: Shortcut, mac: boolean): boolean {
  const s = parse(shortcut);
  const wantMeta = mac && s.mod;
  const wantCtrl = s.ctrl || (!mac && s.mod);
  return (
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === s.shift &&
    event.altKey === s.alt &&
    event.key.toLowerCase() === s.key.toLowerCase()
  );
}

const MAC_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const OTHER_NAMES: Record<string, string> = {
  Mod: 'Ctrl',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** The parts of a shortcut as shown to the user: `['⌘', '⇧', 'Z']` or `['Ctrl', 'Shift', 'Z']`. */
export function shortcutParts(shortcut: Shortcut, mac: boolean): string[] {
  return shortcut.split('+').map((part) => {
    const named = mac ? MAC_SYMBOLS[part] : OTHER_NAMES[part];
    return named ?? (part.length === 1 ? part.toUpperCase() : part);
  });
}

export function formatShortcut(shortcut: Shortcut, mac: boolean): string {
  return shortcutParts(shortcut, mac).join(mac ? '' : '+');
}

/** True when keys typed here belong to a text field rather than to app shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
      target.type,
    );
  }
  return false;
}
