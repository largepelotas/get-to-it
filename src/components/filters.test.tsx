import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import type { Filter, Item } from '@/data/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { createFilter } from '@/store/actions/filters';
import { createItem, setChecked, setItemCollapsed } from '@/store/actions/items';
import { createLabel } from '@/store/actions/labels';
import { createList } from '@/store/actions/lists';
import { createSection } from '@/store/actions/sections';
import { resetForTests, setSetting, useData } from '@/store/data';
import { navigate, openDialog, useUI } from '@/store/ui';

// Filters (step 7): the sidebar area, the dialog, the filter view, sorting and
// grouping in every view, and the Eisenhower matrix.

beforeAll(() => preloadDialogs());

let work: string;
let home: string;
const today = todayKey();
const tomorrow = addDaysKey(today, 1);

beforeEach(() => {
  toast.dismiss();
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    detailsOpen: false,
    duePickerFor: null,
  });
  work = createList({ type: 'todo', title: 'Work' });
  home = createList({ type: 'todo', title: 'Home' });
  setSetting('defaultListId', home);
});

const items = () => Object.values(useData.getState().tables.items);
const find = (text: string) => items().find((i) => i.text === text) as Item;
const filters = () => Object.values(useData.getState().tables.filters) as Filter[];
const filterNamed = (name: string) => filters().find((f) => f.name === name) as Filter;
const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }));
const filterButton = (name: string) =>
  sidebar().getByRole('button', { name: new RegExp(String.raw`^(${name})\d*$`) });
const row = (text: string) => screen.getByRole('listitem', { name: text });
/** The task texts of every row on screen, top to bottom. */
const rowTexts = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => within(li).getByRole<HTMLInputElement>('textbox', { name: 'Task' }).value);
const dialog = () => screen.getByRole('dialog');

/** Two tasks due today in different lists with different priorities, and one overdue. */
function seedToday() {
  createItem(work, { text: 'Write report', dueDate: today, priority: 3 });
  createItem(home, { text: 'Buy milk', dueDate: today, priority: 1 });
  createItem(work, { text: 'Old thing', dueDate: addDaysKey(today, -2) });
}

describe('sidebar Filters area', () => {
  // Breaks if the area shows an empty heading (and a "+") when there are no filters.
  it('is hidden while there are no filters', () => {
    render(<App />);
    expect(sidebar().queryByText('Filters')).not.toBeInTheDocument();
    expect(sidebar().queryByRole('button', { name: 'New filter' })).not.toBeInTheDocument();
  });

  // Breaks if counts include done tasks or tasks from other lists, or a broken filter shows 0.
  it('lists filters in order with a match count, none for one that cannot run, and marks the open one', async () => {
    seedToday();
    const p1 = createFilter({ name: 'Urgent', query: 'p1 | overdue' })!;
    createFilter({ name: 'Broken', query: '@nothing' });
    const user = userEvent.setup();
    render(<App />);
    const rows = sidebar()
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /^(Urgent|Broken)/.test(t ?? ''));
    expect(rows).toEqual(['Urgent2', 'Broken']);

    await user.click(filterButton('Urgent'));
    expect(useUI.getState().view).toEqual({ kind: 'filter', filterId: p1 });
    expect(filterButton('Urgent')).toHaveAttribute('aria-current', 'page');
    expect(filterButton('Broken')).not.toHaveAttribute('aria-current');
  });

  // Breaks if Escape saves, or a blank name wipes the filter's name.
  it('renames in place: Enter saves, Escape cancels, blank keeps the old name', async () => {
    const id = createFilter({ name: 'Urgent', query: 'p1' })!;
    const user = userEvent.setup();
    render(<App />);
    const rename = async () => {
      await user.dblClick(filterButton('Urgent|Hot'));
      return screen.getByRole('textbox', { name: 'Filter name' });
    };
    let field = await rename();
    await user.clear(field);
    await user.type(field, 'Hot{Enter}');
    expect(useData.getState().tables.filters[id].name).toBe('Hot');

    field = await rename();
    await user.clear(field);
    await user.type(field, 'Nope{Escape}');
    expect(useData.getState().tables.filters[id].name).toBe('Hot');

    field = await rename();
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(useData.getState().tables.filters[id].name).toBe('Hot');
  });

  // Breaks if deleting the open filter leaves its view up, or Undo doesn't bring it back.
  it('deletes from the actions menu, leaving the view, and Undo brings the filter back', async () => {
    const id = createFilter({ name: 'Urgent', query: 'p1' })!;
    const user = userEvent.setup();
    render(<App />);
    await user.click(filterButton('Urgent'));
    await user.click(sidebar().getByRole('button', { name: 'Urgent actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete filter' }));
    expect(useData.getState().tables.filters[id]).toBeUndefined();
    expect(useUI.getState().view).toEqual({ kind: 'list', listId: home });
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(useData.getState().tables.filters[id]).toMatchObject({ name: 'Urgent' });
  });

  it('opens the filter in the dialog from "Edit filter…"', async () => {
    createFilter({ name: 'Urgent', query: 'p1' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(sidebar().getByRole('button', { name: 'Urgent actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit filter…' }));
    expect(await screen.findByRole('dialog', { name: 'Edit filter' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('p1');
  });
});

describe('filter dialog', () => {
  // Breaks if a typo can be saved, or a good query doesn't say how many tasks it finds.
  it('shows what the query matches as you type, refuses a bad one, and opens the new view', async () => {
    seedToday();
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'filter' }));
    const d = within(await screen.findByRole('dialog', { name: 'New filter' }));
    await user.type(d.getByRole('textbox', { name: 'Name' }), 'Urgent');
    const query = d.getByRole('textbox', { name: 'Search' });
    await user.type(query, 'p1 &');
    expect(d.getByRole('alert')).toHaveTextContent('Something is missing after &.');
    await user.click(d.getByRole('button', { name: 'Create' }));
    expect(filters()).toEqual([]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.type(query, ' overdue');
    expect(d.getByRole('status')).toHaveTextContent('Matches 0 tasks.');
    await user.clear(query);
    await user.type(query, 'p1 | overdue');
    expect(d.getByRole('status')).toHaveTextContent('Matches 2 tasks.');
    await user.click(d.getByRole('button', { name: 'Create' }));
    const made = filterNamed('Urgent');
    expect(made).toMatchObject({ query: 'p1 | overdue' });
    expect(useUI.getState().view).toEqual({ kind: 'filter', filterId: made.id });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(filterButton('Urgent')).toBeInTheDocument();
  });

  it('asks for a name', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'filter' }));
    const d = within(await screen.findByRole('dialog', { name: 'New filter' }));
    await user.type(d.getByRole('textbox', { name: 'Search' }), 'p1');
    await user.click(d.getByRole('button', { name: 'Create' }));
    expect(d.getByRole('alert')).toHaveTextContent('Give the filter a name.');
    expect(filters()).toEqual([]);
  });

  it('saves changes to an existing filter', async () => {
    const id = createFilter({ name: 'Urgent', query: 'p1' })!;
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'filter', filterId: id }));
    const d = within(await screen.findByRole('dialog', { name: 'Edit filter' }));
    expect(d.getByRole('textbox', { name: 'Name' })).toHaveValue('Urgent');
    const query = d.getByRole('textbox', { name: 'Search' });
    await user.clear(query);
    await user.type(query, 'p1 & today');
    await user.click(d.getByRole('button', { name: 'Save' }));
    expect(useData.getState().tables.filters[id]).toMatchObject({
      name: 'Urgent',
      query: 'p1 & today',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('filter view', () => {
  const open = (filterId: string) => act(() => navigate({ kind: 'filter', filterId }));

  // Breaks if non-matching tasks, done tasks or the list name are missing.
  it('shows the matching open tasks with their list, the query and a count', () => {
    seedToday();
    const id = createFilter({ name: 'Urgent', query: 'p1 | overdue' })!;
    render(<App />);
    open(id);
    expect(screen.getByRole('heading', { level: 1, name: 'Urgent' })).toBeInTheDocument();
    expect(screen.getByText('p1 | overdue')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(within(row('Buy milk')).getByText('Home')).toBeInTheDocument();
    expect(row('Old thing')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Write report' })).not.toBeInTheDocument();
  });

  // Breaks if a filter naming a list that is gone shows an empty view with no explanation.
  it('explains a filter that cannot run and offers to edit it', async () => {
    const id = createFilter({ name: 'Gone', query: '#Nowhere & p1' })!;
    const user = userEvent.setup();
    render(<App />);
    open(id);
    expect(screen.getByText('This filter can’t run.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('There’s no list called “Nowhere”.');
    await user.click(screen.getByRole('button', { name: 'Change the search' }));
    expect(await screen.findByRole('dialog', { name: 'Edit filter' })).toBeInTheDocument();
  });

  // Breaks if a task added in the view doesn't get what the query asks for, so it vanishes at once.
  it('quick add gives new tasks the list, label, day and priority the query requires', async () => {
    const errands = createLabel('Errands')!;
    const id = createFilter({ name: 'Chores', query: '#Work & @errands & p2 & tomorrow' })!;
    const user = userEvent.setup();
    render(<App />);
    open(id);
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Post the parcel{Enter}');
    expect(find('Post the parcel')).toMatchObject({
      listId: work,
      labelIds: [errands],
      priority: 2,
      dueDate: tomorrow,
    });
    expect(row('Post the parcel')).toBeInTheDocument();
  });
});

describe('sort and group', () => {
  type User = ReturnType<typeof userEvent.setup>;
  /** Opens "View options" (if it isn't) and picks a choice in one of its groups. */
  const pick = async (user: User, group: 'Sort by' | 'Group by', choice: string) => {
    if (!screen.queryByRole('dialog', { name: 'View options' })) {
      await user.click(screen.getByRole('button', { name: 'View options' }));
    }
    const popover = await screen.findByRole('dialog', { name: 'View options' });
    await user.click(
      within(within(popover).getByRole('radiogroup', { name: group })).getByRole('radio', {
        name: choice,
      }),
    );
  };
  const sortBy = (user: User, choice: string) => pick(user, 'Sort by', choice);
  const groupBy = (user: User, choice: string) => pick(user, 'Group by', choice);

  // Breaks if the choice doesn't reorder the rows, isn't remembered, or group headings don't appear.
  it('reorders Today by priority or name, groups it by list, and remembers the choice', async () => {
    seedToday();
    const user = userEvent.setup();
    render(<App />);
    expect(rowTexts()).toEqual(['Old thing', 'Buy milk', 'Write report']);

    await sortBy(user, 'Name');
    expect(rowTexts()).toEqual(['Old thing', 'Buy milk', 'Write report']);
    await groupBy(user, 'List');
    expect(screen.getByRole('region', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Home' })).toBeInTheDocument();
    expect(rowTexts()).toEqual(['Old thing', 'Write report', 'Buy milk']);
    expect(useData.getState().settings.viewOptions.today).toEqual({
      sort: 'name',
      group: 'list',
      layout: 'list',
    });

    await sortBy(user, 'Priority');
    expect(rowTexts()).toEqual(['Write report', 'Old thing', 'Buy milk']);
    await groupBy(user, 'Overdue and today');
    expect(screen.getByRole('region', { name: 'Overdue' })).toBeInTheDocument();
    expect(rowTexts()).toEqual(['Old thing', 'Buy milk', 'Write report']);
  });

  // Breaks if a sorted list still offers dragging and sections, or can't go back to its own order.
  it('draws a list flat when sorted or grouped, and back in its own order afterwards', async () => {
    const later = createSection(work, 'Later')!;
    createItem(work, { text: 'Zebra', priority: 3 });
    createItem(work, { text: 'Apple', priority: 1 });
    createItem(work, { text: 'Mango', priority: 2, sectionId: later });
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate({ kind: 'list', listId: work }));
    expect(rowTexts()).toEqual(['Zebra', 'Apple', 'Mango']);
    expect(screen.getByRole('button', { name: /^Add section$/ })).toBeInTheDocument();

    // Sorted by name, still in its sections: the unsectioned tasks, then Later.
    await sortBy(user, 'Name');
    expect(rowTexts()).toEqual(['Apple', 'Zebra', 'Mango']);
    expect(screen.getByRole('region', { name: 'Later' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add section$/ })).not.toBeInTheDocument();
    await groupBy(user, 'None');
    expect(rowTexts()).toEqual(['Apple', 'Mango', 'Zebra']);
    expect(screen.queryByRole('region', { name: 'Later' })).not.toBeInTheDocument();
    await sortBy(user, 'Priority');
    await groupBy(user, 'Sections');
    expect(rowTexts()).toEqual(['Apple', 'Zebra', 'Mango']);
    expect(useData.getState().settings.viewOptions[`list:${work}`]).toEqual({
      sort: 'priority',
      group: 'default',
      layout: 'list',
    });

    await sortBy(user, 'List order');
    expect(screen.getByRole('button', { name: /^Add section$/ })).toBeInTheDocument();
    expect(rowTexts()).toEqual(['Zebra', 'Apple', 'Mango']);
    expect(useData.getState().settings.viewOptions[`list:${work}`]).toBeUndefined();
  });

  // Bug prevented: a done subtask shown ticked among open rows, a collapsed parent's subtasks
  // missing, and a note claiming completed tasks are on screen.
  it('shows every open task, no done subtasks, and says completed tasks are not shown', async () => {
    const open = createItem(work, { text: 'Open parent' })!;
    createItem(work, { text: 'Done sub', parentId: open });
    createItem(work, { text: 'Live sub', parentId: open });
    const folded = createItem(work, { text: 'Folded parent' })!;
    createItem(work, { text: 'Hidden sub', parentId: folded });
    const finished = createItem(work, { text: 'Finished' })!;
    setChecked(find('Done sub').id, true);
    setItemCollapsed(folded, true);
    setChecked(finished, true);
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate({ kind: 'list', listId: work }));
    await sortBy(user, 'Name');
    expect(rowTexts()).toEqual(['Folded parent', 'Hidden sub', 'Live sub', 'Open parent']);
    expect(
      screen.getByText('1 completed task isn’t shown while the list is sorted or grouped.'),
    ).toBeInTheDocument();
  });
});

describe('Eisenhower matrix', () => {
  it('sorts every open task into one of four boxes', () => {
    createItem(work, { text: 'Fire', dueDate: addDaysKey(today, -1), priority: 1 });
    createItem(work, { text: 'Plan', dueDate: addDaysKey(today, 20), priority: 2 });
    createItem(home, { text: 'Chore', dueDate: today });
    createItem(home, { text: 'Someday' });
    render(<App />);
    act(() => navigate({ kind: 'matrix' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Eisenhower matrix' }),
    ).toBeInTheDocument();
    const box = (name: string) => within(screen.getByRole('region', { name }));
    expect(box('Urgent and important').getByRole('listitem', { name: 'Fire' })).toBeInTheDocument();
    expect(
      box('Important, not urgent').getByRole('listitem', { name: 'Plan' }),
    ).toBeInTheDocument();
    expect(
      box('Urgent, not important').getByRole('listitem', { name: 'Chore' }),
    ).toBeInTheDocument();
    expect(box('Neither').getByRole('listitem', { name: 'Someday' })).toBeInTheDocument();
    expect(rowTexts()).toEqual(['Fire', 'Plan', 'Chore', 'Someday']);
  });

  // Breaks if a bad search in Settings leaves the matrix blank with no explanation.
  it('is set up in Settings, and says when a search is wrong', async () => {
    createItem(work, { text: 'Fire', dueDate: today, priority: 1 });
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate({ kind: 'matrix' }));
    await user.click(screen.getByRole('button', { name: 'Matrix settings' }));
    const d = within(await screen.findByRole('dialog', { name: 'Settings' }));
    const urgent = d.getByRole('textbox', { name: 'Urgent when' });
    expect(urgent).toHaveValue('overdue | today');
    await user.clear(urgent);
    await user.type(urgent, 'p1 &');
    expect(d.getByRole('alert')).toHaveTextContent('Something is missing after &.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('The matrix can’t run.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The “urgent” search');
  });

  it('can be hidden from the sidebar in Settings', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(sidebar().getByRole('button', { name: 'Eisenhower matrix' })).toBeInTheDocument();
    act(() => openDialog({ kind: 'settings' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show Eisenhower matrix' }));
    expect(useData.getState().settings.hiddenViews).toEqual(['matrix']);
    expect(sidebar().queryByRole('button', { name: 'Eisenhower matrix' })).not.toBeInTheDocument();
  });
});

describe('palette', () => {
  // Breaks if filters and the matrix can't be reached from the keyboard.
  it('has "Go to filter" per filter, "New filter…" and the matrix', async () => {
    const id = createFilter({ name: 'Urgent', query: 'p1' })!;
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('go to filter urg');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(useUI.getState().view).toEqual({ kind: 'filter', filterId: id }));

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('eisenhower');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(useUI.getState().view).toEqual({ kind: 'matrix' }));

    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('new filter');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'New filter' })).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
  });
});
