import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Heatmap } from './Heatmap';

const weeks = [
  [
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
  ],
  ['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null],
];

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const originalLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');

afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', original);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
  if (originalLeft) Object.defineProperty(Element.prototype, 'scrollLeft', originalLeft);
});

describe('Heatmap', () => {
  // Bug prevented: a heatmap wider than its box opening at the oldest week, so today was
  // off-screen to the right and had to be scrolled to.
  it('opens scrolled to the newest week', () => {
    const set: number[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => 480,
    });
    Object.defineProperty(Element.prototype, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: (v: number) => void set.push(v),
    });
    render(<Heatmap weeks={weeks} values={new Map()} name="map" label={() => ''} />);
    expect(screen.getByRole('group', { name: 'Heatmap' })).toBeInTheDocument();
    expect(set).toContain(480);
  });
});
