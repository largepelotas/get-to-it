import { describe, expect, it } from 'vitest';
import {
  cleanViewOptions,
  DEFAULT_VIEW_OPTIONS,
  sameViewOptions,
  viewOptionsFor,
} from './viewOptions';

describe('view layout', () => {
  // Bug prevented: a saved board layout being dropped on load, so a view snaps back to a list.
  it('keeps layout board', () => {
    const out = cleanViewOptions({ today: { sort: 'date', group: 'priority', layout: 'board' } });
    expect(out.today).toEqual({ sort: 'date', group: 'priority', layout: 'board' });
  });

  // Bug prevented: a hand-edited or future layout crashing the view instead of reading as a list.
  it('turns a bad layout into list', () => {
    const out = cleanViewOptions({ today: { sort: 'date', group: 'default', layout: 'cards' } });
    expect(out.today?.layout).toBe('list');
  });

  // Bug prevented: data files written before layouts existing failing to load as lists.
  it('reads an entry without layout as list', () => {
    const opts = viewOptionsFor(
      { viewOptions: { today: { sort: 'date' } as never } },
      { kind: 'today' },
    );
    expect(opts.layout).toBe('list');
    expect(cleanViewOptions({ today: { sort: 'date', group: 'default' } }).today?.layout).toBe(
      'list',
    );
  });

  // Bug prevented: an entry whose only change is the board layout being treated as defaults and discarded.
  it('keeps an entry whose only non-default is layout board', () => {
    const out = cleanViewOptions({ today: { sort: 'manual', group: 'default', layout: 'board' } });
    expect(out.today).toEqual({ sort: 'manual', group: 'default', layout: 'board' });
  });

  // Bug prevented: toggling layout alone not counting as a change, so it is never saved.
  it('sameViewOptions notices a layout-only difference', () => {
    expect(
      sameViewOptions(DEFAULT_VIEW_OPTIONS, { ...DEFAULT_VIEW_OPTIONS, layout: 'board' }),
    ).toBe(false);
  });
});
