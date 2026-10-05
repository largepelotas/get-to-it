import { describe, expect, it } from 'vitest';
import { formatShortcut, isBrowserShortcut, isEditableTarget, matchesShortcut } from './shortcuts';

const key = (
  key: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>> = {},
  code?: string,
) => ({
  key,
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('matchesShortcut', () => {
  it('maps Mod to ⌘ on macOS and Ctrl elsewhere', () => {
    expect(matchesShortcut(key('z', { meta: true }), 'Mod+Z', true)).toBe(true);
    expect(matchesShortcut(key('z', { ctrl: true }), 'Mod+Z', true)).toBe(false);
    expect(matchesShortcut(key('z', { ctrl: true }), 'Mod+Z', false)).toBe(true);
    expect(matchesShortcut(key('z', { meta: true }), 'Mod+Z', false)).toBe(false);
  });

  it('requires the exact modifiers', () => {
    expect(matchesShortcut(key('Z', { meta: true, shift: true }), 'Mod+Z', true)).toBe(false);
    expect(matchesShortcut(key('Z', { meta: true, shift: true }), 'Mod+Shift+Z', true)).toBe(true);
    expect(matchesShortcut(key('y', { ctrl: true }), 'Ctrl+Y', false)).toBe(true);
  });
});

const BACKSLASH = '\\';

describe('the backslash shortcut', () => {
  it('matches the backslash key with Mod on both platforms', () => {
    expect(matchesShortcut(key(BACKSLASH, { meta: true }), `Mod+${BACKSLASH}`, true)).toBe(true);
    expect(matchesShortcut(key(BACKSLASH, { ctrl: true }), `Mod+${BACKSLASH}`, true)).toBe(false);
    expect(matchesShortcut(key(BACKSLASH, { ctrl: true }), `Mod+${BACKSLASH}`, false)).toBe(true);
    expect(matchesShortcut(key(BACKSLASH, { meta: true }), `Mod+${BACKSLASH}`, false)).toBe(false);
    // Shift turns it into a pipe, which is a different shortcut.
    expect(matchesShortcut(key('|', { ctrl: true, shift: true }), `Mod+${BACKSLASH}`, false)).toBe(
      false,
    );
  });

  it('is shown as a backslash', () => {
    expect(formatShortcut(`Mod+${BACKSLASH}`, true)).toBe('⌘' + BACKSLASH);
    expect(formatShortcut(`Mod+${BACKSLASH}`, false)).toBe('Ctrl+' + BACKSLASH);
  });
});

describe('the zoom shortcuts', () => {
  it('match = and - with Mod, and + as Mod+Shift+=', () => {
    expect(matchesShortcut(key('=', { ctrl: true }, 'Equal'), 'Mod+=', false)).toBe(true);
    expect(matchesShortcut(key('=', { meta: true }, 'Equal'), 'Mod+=', true)).toBe(true);
    expect(matchesShortcut(key('-', { ctrl: true }, 'Minus'), 'Mod+-', false)).toBe(true);
    expect(matchesShortcut(key('0', { ctrl: true }, 'Digit0'), 'Mod+0', false)).toBe(true);
    // Shift+= is + on a US keyboard: a different shortcut, offered as an alias.
    expect(matchesShortcut(key('+', { ctrl: true, shift: true }, 'Equal'), 'Mod+=', false)).toBe(
      false,
    );
    expect(
      matchesShortcut(key('+', { ctrl: true, shift: true }, 'Equal'), 'Mod+Shift+=', false),
    ).toBe(true);
    // Without Mod they're just typing.
    expect(matchesShortcut(key('=', {}, 'Equal'), 'Mod+=', false)).toBe(false);
  });

  it('match = typed with Shift, as a German keyboard types it (Shift+0)', () => {
    expect(matchesShortcut(key('=', { ctrl: true, shift: true }, 'Digit0'), 'Mod+=', false)).toBe(
      true,
    );
    // The Equal position prints ´ there, which is not a zoom key.
    expect(matchesShortcut(key('´', { ctrl: true }, 'Equal'), 'Mod+=', false)).toBe(true);
  });

  it('are shown as the plain characters', () => {
    expect(formatShortcut('Mod+=', false)).toBe('Ctrl+=');
    expect(formatShortcut('Mod+-', true)).toBe('⌘-');
  });
});

// Bug prevented: shortcuts on digits and punctuation being unreachable on layouts that
// print something else on those keys, or need Shift to type them.
describe('layouts other than US', () => {
  it('matches the digit keys by position on AZERTY, where they print & é "', () => {
    expect(matchesShortcut(key('&', { ctrl: true }, 'Digit1'), 'Mod+1', false)).toBe(true);
    expect(matchesShortcut(key('é', { meta: true }, 'Digit2'), 'Mod+2', true)).toBe(true);
    expect(matchesShortcut(key('"', { ctrl: true }, 'Digit3'), 'Mod+3', false)).toBe(true);
    expect(matchesShortcut(key('&', {}, 'Digit1'), '1', false)).toBe(true);
    expect(matchesShortcut(key("'", {}, 'Digit4'), '4', false)).toBe(true);
    // Each key is one digit only.
    expect(matchesShortcut(key('&', {}, 'Digit1'), '2', false)).toBe(false);
    // The modifiers still have to be right.
    expect(matchesShortcut(key('&', {}, 'Digit1'), 'Mod+1', false)).toBe(false);
    expect(matchesShortcut(key('&', { ctrl: true }, 'Digit1'), '1', false)).toBe(false);
  });

  it('matches a digit typed with Shift, as AZERTY types them', () => {
    expect(matchesShortcut(key('1', { shift: true }, 'Digit1'), '1', false)).toBe(true);
    expect(matchesShortcut(key('2', { ctrl: true, shift: true }, 'Digit2'), 'Mod+2', false)).toBe(
      true,
    );
  });

  it('keeps Shift+digit from being the plain digit on a US layout', () => {
    expect(matchesShortcut(key('!', { shift: true }, 'Digit1'), '1', false)).toBe(false);
    expect(matchesShortcut(key('!', { meta: true, shift: true }, 'Digit1'), 'Mod+1', true)).toBe(
      false,
    );
    expect(matchesShortcut(key('?', { ctrl: true, shift: true }, 'Slash'), 'Mod+/', false)).toBe(
      false,
    );
    expect(matchesShortcut(key('1', {}, 'Digit1'), '1', false)).toBe(true);
    expect(matchesShortcut(key('1', {}, 'Numpad1'), '1', false)).toBe(true);
  });

  it('reaches Mod+/ and Mod+\\ on a German keyboard', () => {
    // "/" is Shift+7 there.
    expect(matchesShortcut(key('/', { ctrl: true, shift: true }, 'Digit7'), 'Mod+/', false)).toBe(
      true,
    );
    // The keys in the US positions print "-" and "#".
    expect(matchesShortcut(key('-', { ctrl: true }, 'Slash'), 'Mod+/', false)).toBe(true);
    expect(matchesShortcut(key('#', { ctrl: true }, 'Backslash'), `Mod+${BACKSLASH}`, false)).toBe(
      true,
    );
    expect(matchesShortcut(key(';', { meta: true }, 'Comma'), 'Mod+,', true)).toBe(true);
  });

  it('leaves a key that types a letter alone, whatever its position', () => {
    // Dvorak has Z where US has "/", and W where US has ",".
    expect(matchesShortcut(key('z', { meta: true }, 'Slash'), 'Mod+/', true)).toBe(false);
    expect(matchesShortcut(key('z', { meta: true }, 'Slash'), 'Mod+Z', true)).toBe(true);
    expect(matchesShortcut(key('w', { meta: true }, 'Comma'), 'Mod+,', true)).toBe(false);
    // Letters are matched by what they type, never by position.
    expect(matchesShortcut(key('a', { ctrl: true }, 'KeyQ'), 'Mod+Q', false)).toBe(false);
    // Shift still matters for a letter.
    expect(matchesShortcut(key('E', { shift: true }, 'KeyE'), 'e', false)).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('uses symbols on macOS and names elsewhere', () => {
    expect(formatShortcut('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatShortcut('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Alt+ArrowUp', true)).toBe('⌥↑');
  });
});

describe('isBrowserShortcut', () => {
  it('catches reload, print and find next', () => {
    expect(isBrowserShortcut(key('F5'), false)).toBe(true);
    expect(isBrowserShortcut(key('r', { ctrl: true }), false)).toBe(true);
    expect(isBrowserShortcut(key('R', { ctrl: true, shift: true }), false)).toBe(true);
    expect(isBrowserShortcut(key('p', { meta: true }), true)).toBe(true);
    expect(isBrowserShortcut(key('F3'), false)).toBe(true);
  });

  it('leaves typing and the app’s own shortcuts alone', () => {
    expect(isBrowserShortcut(key('r'), false)).toBe(false);
    expect(isBrowserShortcut(key('p'), false)).toBe(false);
    expect(isBrowserShortcut(key('f', { ctrl: true }), false)).toBe(false);
    expect(isBrowserShortcut(key('u', { ctrl: true }), false)).toBe(false);
    expect(isBrowserShortcut(key('F6'), false)).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('recognises text fields but not buttons or checkboxes', () => {
    const input = document.createElement('input');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
