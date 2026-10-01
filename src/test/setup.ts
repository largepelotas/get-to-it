import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only cleans up automatically when Vitest globals are on.
afterEach(cleanup);

// The due-date picker and the editor are lazy-loaded. The first load in a test file
// can take over a second when the whole suite runs in parallel, longer than findBy*
// waits by default (1 s), so waits get 3 s (under Vitest's 5 s per test).
configure({ asyncUtilTimeout: 3000 });

// jsdom has no pointer capture, which sonner's toasts call on pointer down. (Node-only
// tests have no DOM at all.)
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// ProseMirror (the notes editor) measures the selection to scroll it into view. jsdom
// does no layout, so these return empty boxes.
if (typeof Element !== 'undefined') {
  const emptyRects = () => {
    const list: DOMRect[] = [];
    return Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;
  };
  if (!Element.prototype.getClientRects) Element.prototype.getClientRects = emptyRects;
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRects;
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
}

// cmdk (the command palette) observes its list's size and scrolls the selected item into
// view. jsdom has neither.
if (typeof window !== 'undefined') {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
}
