import { describe, expect, it } from 'vitest';
import { formatShortcut, isEditableTarget, matchesShortcut } from './shortcuts';

const key = (
  key: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>> = {},
) => ({
  key,
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

describe('formatShortcut', () => {
  it('uses symbols on macOS and names elsewhere', () => {
    expect(formatShortcut('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatShortcut('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Alt+ArrowUp', true)).toBe('⌥↑');
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
