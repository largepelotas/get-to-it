import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { setViewOptions } from '@/commands';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import type { View } from '@/store/ui';
import { createItem } from '@/store/actions/items';
import { createLabel } from '@/store/actions/labels';
import { createList } from '@/store/actions/lists';
import { createSection } from '@/store/actions/sections';
import { resetForTests, useData } from '@/store/data';
import { navigate, useUI } from '@/store/ui';

// Dialogs load lazily; loaded up front the palette opens without suspending.
beforeAll(() => preloadDialogs());

// Friday 2 October 2026, so the date columns are the same whatever day the suite runs.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    selectedItemId: null,
    detailsOpen: false,
  });
});
afterEach(() => vi.useRealTimers());

const region = (name: string) => within(screen.getByRole('region', { name }));
const regionNames = () =>
  within(screen.getByRole('main'))
    .getAllByRole('region')
    .map((r) => r.getAttribute('aria-label'));

/** A list with two sections ("Doing" with a task, "Done soon" empty) and one unsectioned task. */
function seedList(): { listId: string; view: View } {
  const listId = createList({ type: 'todo', title: 'Project' });
  const doing = createSection(listId, 'Doing')!;
  createSection(listId, 'Later');
  createItem(listId, { text: 'Loose task' });
  createItem(listId, { text: 'Active task', sectionId: doing });
  const view: View = { kind: 'list', listId };
  navigate(view);
  return { listId, view };
}

describe('boards', () => {
  // Bug prevented: a board that drops empty columns leaves nowhere to drag a card to.
  it('draws a list as a column per section, empty ones included', () => {
    const { view } = seedList();
    setViewOptions(view, { sort: 'manual', group: 'default', layout: 'board' });
    render(<App />);
    expect(regionNames()).toEqual(['No section', 'Doing', 'Later']);
    expect(region('No section').getByRole('listitem', { name: 'Loose task' })).toBeInTheDocument();
    expect(region('Doing').getByRole('listitem', { name: 'Active task' })).toBeInTheDocument();
    expect(region('Later').getByText('No tasks')).toBeInTheDocument();
  });

  // Bug prevented: the Layout choice does nothing, or can't be undone from the same popover.
  it('switches between list and board from View options', async () => {
    seedList();
    const user = userEvent.setup();
    render(<App />);
    expect(within(screen.getByRole('main')).queryByRole('region')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View options' }));
    const layout = within(await screen.findByRole('radiogroup', { name: 'Layout' }));
    await user.click(layout.getByRole('radio', { name: 'Board' }));
    expect(regionNames()).toEqual(['No section', 'Doing', 'Later']);
    await user.click(layout.getByRole('radio', { name: 'List' }));
    expect(within(screen.getByRole('main')).queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Loose task' })).toBeInTheDocument();
  });

  // Bug prevented: Today's board has no columns to drop on until a grouping is chosen, or shows Overdue with nothing in it.
  it('groups Today by priority, or by date with Overdue only when something is overdue', () => {
    const listId = createList({ type: 'todo', title: 'Work' });
    createItem(listId, { text: 'Urgent', dueDate: '2026-10-02', priority: 1 });
    const today: View = { kind: 'today' };
    setViewOptions(today, { sort: 'manual', group: 'default', layout: 'board' });
    const { unmount } = render(<App />);
    expect(regionNames()).toEqual(['Priority 1', 'Priority 2', 'Priority 3', 'No priority']);
    expect(region('Priority 1').getByRole('listitem', { name: 'Urgent' })).toBeInTheDocument();
    unmount();

    act(() => setViewOptions(today, { sort: 'manual', group: 'date', layout: 'board' }));
    render(<App />);
    expect(regionNames()).toEqual(['Today', 'Tomorrow', 'No date']);
    expect(screen.queryByRole('region', { name: 'Overdue' })).not.toBeInTheDocument();
  });

  // Bug prevented: a label view's board lacks the other labels' columns, so a card can't be moved to them.
  it('draws a label view grouped by label as a column per label and No label', () => {
    const errands = createLabel('Errands')!;
    createLabel('Calls');
    const listId = createList({ type: 'todo', title: 'Work' });
    createItem(listId, { text: 'Post parcel', labelIds: [errands] });
    const view: View = { kind: 'label', labelId: errands };
    setViewOptions(view, { sort: 'manual', group: 'label', layout: 'board' });
    navigate(view);
    render(<App />);
    expect(regionNames()).toEqual(['Errands', 'Calls', 'No label']);
    expect(region('Errands').getByRole('listitem', { name: 'Post parcel' })).toBeInTheDocument();
  });

  // Bug prevented: the palette offers no way to switch layout, or keeps offering the layout already shown.
  it('"Show as board" in the palette switches the list, then offers "Show as list"', async () => {
    const { listId } = seedList();
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('board');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(useData.getState().settings.viewOptions[`list:${listId}`]?.layout).toBe('board'),
    );
    expect(regionNames()).toEqual(['No section', 'Doing', 'Later']);

    await user.keyboard('{Control>}k{/Control}');
    const palette = within(screen.getByRole('dialog', { name: 'Search and commands' }));
    expect(palette.queryByRole('option', { name: 'Show as board' })).not.toBeInTheDocument();
    expect(palette.getByRole('option', { name: 'Show as list' })).toBeInTheDocument();
  });

  // Bug prevented: the card layout leaks into list layout (or never applies to a board), so rows are crushed in columns or change shape in lists. jsdom has no layout, so this proves only the marker, not how the card looks.
  it('marks rows as cards in board layout only', () => {
    const { view } = seedList();
    const { unmount } = render(<App />);
    expect(screen.getByRole('listitem', { name: 'Loose task' })).not.toHaveAttribute('data-card');
    unmount();
    setViewOptions(view, { sort: 'manual', group: 'default', layout: 'board' });
    render(<App />);
    expect(screen.getByRole('listitem', { name: 'Loose task' })).toHaveAttribute('data-card');
  });

  // Bug prevented: the layout command is offered on a list that can't be a board (grocery), where it does nothing visible.
  it('offers no layout command on a grocery list', async () => {
    const listId = createList({ type: 'grocery', title: 'Shop' });
    navigate({ kind: 'list', listId });
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const palette = within(screen.getByRole('dialog', { name: 'Search and commands' }));
    expect(palette.getByRole('option', { name: /New item/ })).toBeInTheDocument();
    expect(palette.queryByRole('option', { name: /Show as/ })).not.toBeInTheDocument();
  });
});
