import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMultiSelection,
  dropMissingSelection,
  focusItem,
  navigate,
  selectAll,
  selectItem,
  selectRange,
  toggleSelected,
  useUI,
} from './ui';

const ids = ['a', 'b', 'c', 'd', 'e'];
const multi = () => useUI.getState().multiSelectedIds;
const primary = () => useUI.getState().selectedItemId;

beforeEach(() => {
  useUI.setState({
    view: { kind: 'today' },
    selectedItemId: null,
    multiSelectedIds: [],
    selectionAnchor: null,
    detailsOpen: false,
  });
});

describe('selecting several tasks', () => {
  // Bug it prevents: a plain click left the old group selected, so a later bulk action
  // changed tasks the user thought they had let go of.
  it('goes back to one task on a plain select', () => {
    selectItem('a');
    toggleSelected('c', ids);
    expect(multi()).toEqual(['a', 'c']);
    selectItem('b');
    expect(multi()).toEqual([]);
    expect(primary()).toBe('b');
  });

  // Bug it prevents: Ctrl+click on the first task started a group of one, or dropped
  // the task that was already selected.
  it('toggles tasks in and out, keeping visible order', () => {
    selectItem('c');
    toggleSelected('a', ids);
    expect(multi()).toEqual(['a', 'c']);
    expect(primary()).toBe('a');
    toggleSelected('e', ids);
    expect(multi()).toEqual(['a', 'c', 'e']);
    toggleSelected('c', ids);
    expect(multi()).toEqual(['a', 'e']);
    toggleSelected('a', ids);
    // One left is just a selection, not a group.
    expect(multi()).toEqual([]);
    expect(primary()).toBe('e');
  });

  // Bug it prevents: a range counted from the last Ctrl+click instead of the last plain click.
  it('selects a range from the anchor, in either direction', () => {
    selectItem('b');
    selectRange('d', ids);
    expect(multi()).toEqual(['b', 'c', 'd']);
    expect(primary()).toBe('d');
    selectRange('a', ids);
    expect(multi()).toEqual(['a', 'b']);
    selectRange('b', ids);
    expect(multi()).toEqual([]);
    expect(primary()).toBe('b');
  });

  it('selects every visible task, and a focus on one of them keeps the group', () => {
    selectItem('c');
    selectAll(ids);
    expect(multi()).toEqual(ids);
    focusItem('d', false);
    expect(multi()).toEqual(ids);
    expect(primary()).toBe('d');
    // Focusing a task to edit its text goes back to one task.
    focusItem('d', true);
    expect(multi()).toEqual([]);
  });

  it('clears to the focused task on request', () => {
    selectItem('c');
    selectAll(ids);
    clearMultiSelection();
    expect(multi()).toEqual([]);
    expect(primary()).toBe('c');
  });

  // Bug it prevents: a bulk action ran on tasks that had been deleted or moved away.
  it('drops ids that leave the view, and ends the group below two', () => {
    selectItem('a');
    selectAll(ids);
    dropMissingSelection(['a', 'b', 'c', 'e']);
    expect(multi()).toEqual(['a', 'b', 'c', 'e']);
    dropMissingSelection(['b', 'c']);
    expect(multi()).toEqual(['b', 'c']);
    expect(primary()).toBe('b');
    dropMissingSelection(['c']);
    expect(multi()).toEqual([]);
    expect(primary()).toBe('c');
  });

  // Bug it prevents: the group followed the user into another view.
  it('is cleared by navigating', () => {
    selectItem('a');
    selectAll(ids);
    navigate({ kind: 'upcoming' });
    expect(multi()).toEqual([]);
    expect(primary()).toBeNull();
  });
});
