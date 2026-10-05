/**
 * Keyboard shortcuts written as `Mod+Shift+Z`. `Mod` is ⌘ on macOS and Ctrl
 * elsewhere. The key is compared case-insensitively against `event.key`.
 * Digits and the punctuation keys in `PHYSICAL_KEYS` also match by where the
 * key is on the keyboard, for layouts that can't type them plainly.
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
  /** The physical key (`Digit1`, `Slash`), whatever the layout prints on it. */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Where the digits and the punctuation used in shortcuts sit on a US keyboard.
 * Other layouts print something else there, or need Shift to reach the
 * character: AZERTY has the digits on Shift, and a German keyboard has `/` on
 * Shift+7 and no plain `\` at all.
 */
const PHYSICAL_KEYS: Record<string, string> = {
  '/': 'Slash',
  '\\': 'Backslash',
  ',': 'Comma',
  '=': 'Equal',
  '-': 'Minus',
  ...Object.fromEntries(Array.from('0123456789', (d) => [d, `Digit${d}`])),
};

/**
 * A plain letter or digit: a key that already means something, so its position
 * is not consulted. Accented letters don't count: AZERTY prints é, è, ç and à
 * on its digit keys.
 */
const ALPHANUMERIC = /^[a-z0-9]$/i;

export function matchesShortcut(event: KeyLike, shortcut: Shortcut, mac: boolean): boolean {
  const s = parse(shortcut);
  const wantMeta = mac && s.mod;
  const wantCtrl = s.ctrl || (!mac && s.mod);
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl || event.altKey !== s.alt) {
    return false;
  }
  const code = PHYSICAL_KEYS[s.key];
  if (event.key.toLowerCase() === s.key.toLowerCase()) {
    // Where the layout needs Shift to type the character (1 on AZERTY, / on a German
    // keyboard) the Shift is part of typing it. A US layout never gets here with Shift
    // held: Shift+1 is "!" there.
    return event.shiftKey === s.shift || (!!code && !s.shift);
  }
  // The key in the US position, for layouts that print something else on it. A key that
  // types a letter or digit is left alone: on Dvorak the Slash position is Z, and ⌘Z
  // must stay Undo.
  return (
    !!code && event.code === code && event.shiftKey === s.shift && !ALPHANUMERIC.test(event.key)
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

/**
 * Shortcuts the web view would act on itself: reload, print, downloads, find
 * next and caret browsing. None of them means anything in the app.
 */
const BROWSER_SHORTCUTS: Shortcut[] = [
  'F5',
  'Ctrl+F5',
  'Shift+F5',
  'Mod+R',
  'Mod+Shift+R',
  'Mod+P',
  'Mod+J',
  'Mod+G',
  'Mod+Shift+G',
  'F3',
  'Shift+F3',
  'F7',
];

export function isBrowserShortcut(event: KeyLike, mac: boolean): boolean {
  return BROWSER_SHORTCUTS.some((shortcut) => matchesShortcut(event, shortcut, mac));
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
