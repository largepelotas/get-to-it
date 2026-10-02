import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, fromDateKey, todayKey } from '@/lib/dates';
import { addHabit, toggleCheckIn } from '@/store/actions/habits';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { openDialog, openList, useUI } from '@/store/ui';

let list: string;

beforeAll(() => preloadDialogs());

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    detailsOpen: false,
  });
  list = createList({ type: 'habit', title: 'Routine' });
  openList(list);
});

const add = (text: string) => addHabit(list, text)!;
const row = (text: string) => screen.getByRole('listitem', { name: text });
const dayName = (offset: number, done: boolean) =>
  `${format(fromDateKey(addDaysKey(todayKey(), offset)), 'EEE d MMM')}, ${done ? 'done' : 'not done'}`;
const habit = (text: string) =>
  Object.values(useData.getState().tables.items).find((i) => i.text === text)!;

describe('HabitList', () => {
  // Bug prevented: a habit list falling through to the to-do screen, with no habit quick add.
  it('adds habits from the quick add field and keeps focus there', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText('No habits yet. Add one above.')).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Add a habit' });
    // Dates and priorities in the text are part of the name, not read out of it.
    await user.type(field, 'Run tomorrow p1{Enter}Read{Enter}');
    expect(field).toHaveFocus();
    expect(field).toHaveValue('');
    expect(screen.getByRole('listitem', { name: 'Run tomorrow p1' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Read' })).toBeInTheDocument();
    expect(screen.getByText('0 of 2 done today')).toBeInTheDocument();
    expect(screen.queryByText('No habits yet. Add one above.')).not.toBeInTheDocument();
  });

  // Bug prevented: the tick not reaching the streak or the "done today" line.
  it('ticks today and updates the streak and the done-today line', async () => {
    add('Read');
    add('Run');
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText('0 of 2 done today')).toBeInTheDocument();
    await user.click(within(row('Read')).getByRole('checkbox', { name: 'Read' }));
    expect(within(row('Read')).getByRole('checkbox', { name: 'Read' })).toBeChecked();
    expect(within(row('Read')).getByText('1 day streak')).toBeInTheDocument();
    expect(within(row('Run')).getByText('No streak')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 done today')).toBeInTheDocument();
    await user.click(within(row('Read')).getByRole('checkbox', { name: 'Read' }));
    expect(screen.getByText('0 of 2 done today')).toBeInTheDocument();
  });

  // Bug prevented: a missed tick not being fillable afterwards.
  it('toggles a past day from its button', async () => {
    const id = add('Read');
    const user = userEvent.setup();
    render(<App />);
    const yesterday = within(row('Read')).getByRole('button', { name: dayName(-1, false) });
    expect(yesterday).toHaveAttribute('aria-pressed', 'false');
    await user.click(yesterday);
    expect(within(row('Read')).getByRole('button', { name: dayName(-1, true) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(Object.values(useData.getState().tables.checkIns).map((c) => [c.itemId, c.day])).toEqual(
      [[id, addDaysKey(todayKey(), -1)]],
    );
    // Yesterday alone is a streak (today is not done yet, which does not break it).
    expect(within(row('Read')).getByText('1 day streak')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 done today')).toBeInTheDocument();
  });

  // Bug prevented: the goal menu not changing the goal or its progress text.
  it('changes the goal from the row menu', async () => {
    add('Read');
    const user = userEvent.setup();
    render(<App />);
    expect(within(row('Read')).getByText('Every day')).toBeInTheDocument();
    await user.pointer({ keys: '[MouseRight]', target: row('Read') });
    const goal = await screen.findByRole('menuitem', { name: 'Goal' });
    act(() => goal.focus());
    await user.keyboard('{Enter}');
    const choice = await screen.findByRole('menuitem', { name: '3 times a week' });
    act(() => choice.focus());
    await user.keyboard('{Enter}');
    expect(habit('Read').habit).toEqual({ period: 'week', times: 3 });
    expect(within(row('Read')).getByText('0 of 3 this week')).toBeInTheDocument();
  });

  // Bug prevented: the row menu's check-in entry not toggling today.
  it('checks in and undoes the check-in from the row menu', async () => {
    add('Read');
    const user = userEvent.setup();
    render(<App />);
    await user.pointer({ keys: '[MouseRight]', target: row('Read') });
    await user.click(await screen.findByRole('menuitem', { name: 'Check in' }));
    expect(screen.getByText('1 of 1 done today')).toBeInTheDocument();
    await user.pointer({ keys: '[MouseRight]', target: row('Read') });
    await user.click(await screen.findByRole('menuitem', { name: 'Undo check-in' }));
    expect(screen.getByText('0 of 1 done today')).toBeInTheDocument();
  });

  it('renames a habit in place', async () => {
    add('Read');
    const user = userEvent.setup();
    render(<App />);
    const name = within(row('Read')).getByRole('textbox', { name: 'Habit name' });
    await user.click(name);
    await user.type(name, ' more');
    expect(habit('Read more')).toBeDefined();
  });

  // Bug prevented: deleting a habit being unrecoverable, or losing its check-ins on undo.
  it('deletes a habit and brings it back with Undo, check-ins included', async () => {
    const id = add('Read');
    toggleCheckIn(id, todayKey());
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('Read'));
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('listitem', { name: 'Read' })).not.toBeInTheDocument();
    expect(screen.getByText('No habits yet. Add one above.')).toBeInTheDocument();
    const toast = (await screen.findByText('Deleted “Read”')).closest<HTMLElement>(
      '[data-sonner-toast]',
    )!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(within(row('Read')).getByText('1 day streak')).toBeInTheDocument();
  });

  // Bug prevented: Space on a focused row not checking the habit in for today.
  it('checks in with Space and opens details with Enter', async () => {
    add('Read');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('textbox', { name: 'Add a habit' }));
    await user.keyboard('{ArrowDown}');
    expect(row('Read')).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByText('1 of 1 done today')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('complementary', { name: 'Habit details' })).toBeInTheDocument();
    // Escape inside the panel closes it and hands focus back to the row.
    await user.click(screen.getByRole('textbox', { name: 'Habit title' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Habit details' })).not.toBeInTheDocument();
    expect(row('Read')).toHaveFocus();
  });

  // Bug prevented: Alt+Arrow not reordering habits like other lists.
  it('reorders with Alt+ArrowDown', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(
      within(screen.getByRole('list', { name: 'Habits' }))
        .getAllByRole('listitem')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['B', 'A']);
  });
});

describe('New list dialog', () => {
  // Bug prevented: the habit type missing from the dialog, or opening the to-do screen.
  it('creates a habit list and opens the habit screen', async () => {
    useUI.setState({ view: { kind: 'today' } });
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'newList', folderId: null }));
    await user.click(await screen.findByRole('radio', { name: 'Habits' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Mornings');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('textbox', { name: 'Add a habit' })).toBeInTheDocument();
    const created = Object.values(useData.getState().tables.lists).find(
      (l) => l.title === 'Mornings',
    );
    expect(created?.type).toBe('habit');
  });
});
