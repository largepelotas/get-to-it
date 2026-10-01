import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { createItem, deleteItems, setChecked } from '@/store/actions/items';
import { archiveList, createList, setShowCompleted } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { openList, useUI } from '@/store/ui';

let list: string;
let other: string;
const today = todayKey();
const tomorrow = addDaysKey(today, 1);

beforeEach(() => {
  // Toasts outlive a test; an old one would give a second Undo button.
  toast.dismiss();
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    multiSelectedIds: [],
    selectionAnchor: null,
    selectionDateOpen: false,
    detailsOpen: false,
    duePickerFor: null,
  });
  list = createList({ type: 'todo', title: 'Tasks' });
  other = createList({ type: 'todo', title: 'Other' });
  openList(list);
});

const add = (text: string, extra: Partial<Item> = {}) => createItem(list, { text, ...extra })!;
const find = (text: string) =>
  Object.values(useData.getState().tables.items).find((i) => i.text === text) as Item;
const row = (text: string) => screen.getByRole('listitem', { name: text });
const rowText = (text: string) => within(row(text)).getByRole('textbox', { name: 'Task' });
const bar = () => screen.queryByRole('toolbar', { name: 'Selected tasks' });
const barButton = (name: string) =>
  within(screen.getByRole('toolbar', { name: 'Selected tasks' })).getByRole('button', { name });
const selected = () =>
  screen
    .queryAllByRole('listitem')
    .filter((el) => el.hasAttribute('data-multi-selected'))
    .map((el) => el.getAttribute('aria-label'));

async function ctrlClick(user: UserEvent, el: HTMLElement) {
  await user.keyboard('{Control>}');
  await user.click(el);
  await user.keyboard('{/Control}');
}
async function shiftClick(user: UserEvent, el: HTMLElement) {
  await user.keyboard('{Shift>}');
  await user.click(el);
  await user.keyboard('{/Shift}');
}

describe('selecting several tasks in a to-do list', () => {
  // Bug it prevents: Ctrl+click did nothing (or moved focus and dropped the first task).
  it('adds and removes tasks with Ctrl+click, and shows the bar from two', async () => {
    ['A', 'B', 'C', 'D'].forEach((t) => add(t));
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    expect(bar()).not.toBeInTheDocument();
    await ctrlClick(user, row('C'));
    expect(selected()).toEqual(['A', 'C']);
    expect(bar()).toHaveTextContent('2 selected');
    await ctrlClick(user, row('D'));
    expect(bar()).toHaveTextContent('3 selected');
    await ctrlClick(user, row('A'));
    await ctrlClick(user, row('C'));
    // One left is an ordinary selection again.
    expect(bar()).not.toBeInTheDocument();
    expect(selected()).toEqual([]);
    expect(row('D')).toHaveAttribute('aria-current', 'true');
  });

  it('selects a range with Shift+click, and a plain click goes back to one', async () => {
    ['A', 'B', 'C', 'D'].forEach((t) => add(t));
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('B'));
    await shiftClick(user, row('D'));
    expect(selected()).toEqual(['B', 'C', 'D']);
    await user.click(row('A'));
    expect(selected()).toEqual([]);
    expect(bar()).not.toBeInTheDocument();
  });

  // Bug it prevents: Shift+arrows moved the focus without growing the selection, or
  // never shrank it back.
  it('extends and shrinks the range with Shift+arrows, selects all with Mod+A, clears with Escape', async () => {
    ['A', 'B', 'C', 'D'].forEach((t) => add(t));
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('B'));
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selected()).toEqual(['B', 'C', 'D']);
    expect(row('D')).toHaveFocus();
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(selected()).toEqual(['B', 'C']);
    expect(row('C')).toHaveFocus();
    await user.keyboard('{Control>}a{/Control}');
    expect(selected()).toEqual(['A', 'B', 'C', 'D']);
    await user.keyboard('{Escape}');
    expect(bar()).not.toBeInTheDocument();
    expect(selected()).toEqual([]);
    expect(row('C')).toHaveFocus();
    expect(row('C')).toHaveAttribute('aria-current', 'true');
  });

  // Bug it prevents: Mod+A in the title field selected every task instead of the text.
  it('leaves Mod+A alone while editing a title', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(rowText('A'));
    await user.keyboard('{Control>}a{/Control}');
    expect(bar()).not.toBeInTheDocument();
  });

  // Bug it prevents: the details panel kept showing one task while several were selected.
  it('hides the details panel while several are selected', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('{Control>}i{/Control}');
    expect(screen.getByRole('textbox', { name: 'Task title' })).toBeInTheDocument();
    await shiftClick(user, row('B'));
    expect(screen.queryByRole('textbox', { name: 'Task title' })).not.toBeInTheDocument();
    await user.click(row('A'));
    expect(screen.getByRole('textbox', { name: 'Task title' })).toBeInTheDocument();
  });

  // Bug it prevents: a task that left the list stayed in the selection.
  it('drops a selected task that is deleted elsewhere', async () => {
    ['A', 'B', 'C'].forEach((t) => add(t));
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('C'));
    expect(bar()).toHaveTextContent('3 selected');
    act(() => deleteItems([find('B').id]));
    expect(bar()).toHaveTextContent('2 selected');
    expect(selected()).toEqual(['A', 'C']);
    act(() => deleteItems([find('C').id]));
    // One left is an ordinary selection, not a group.
    expect(bar()).not.toBeInTheDocument();
    expect(selected()).toEqual([]);
  });

  // Bug it prevents: selected rows were marked only by colour, and every one claimed to be the
  // current item.
  it('marks selected rows for screen readers and keeps aria-current on the focused one', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    expect(row('A')).toHaveAccessibleDescription(/Selected/);
    expect(row('B')).toHaveAccessibleDescription(/Selected/);
    expect(row('A')).not.toHaveAttribute('aria-current');
    expect(row('B')).toHaveAttribute('aria-current', 'true');
  });
});

describe('the selection bar', () => {
  async function selectTwo(user: UserEvent, a = 'A', b = 'B') {
    await user.click(row(a));
    await shiftClick(user, row(b));
  }

  // Bug it prevents: bulk complete looped (N undo steps, N toasts).
  it('completes the selected tasks with one toast, and Undo reverts them all', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Complete'));
    expect(find('A').checked && find('B').checked).toBe(true);
    expect(find('C').checked).toBe(false);
    expect(await screen.findByText('Completed 2 tasks')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect([find('A').checked, find('B').checked]).toEqual([false, false]);
  });

  // Bug it prevents: the toast counted every selected task, including ones that were done already.
  it('counts only the tasks that changed in the toast', async () => {
    const a = add('A');
    add('B');
    add('C');
    setChecked(a, true);
    const user = userEvent.setup();
    render(<App />);
    // The done task sits last, under Completed, so the range runs from B down to it.
    await user.click(row('B'));
    await shiftClick(user, row('A'));
    await user.click(barButton('Complete'));
    expect(await screen.findByText('Completed 2 tasks')).toBeInTheDocument();
  });

  // Bug it prevents: a subtask ticked along with its selected parent was left out of the count.
  it('counts a subtask completed with its parent', async () => {
    const p = add('P');
    add('S', { parentId: p });
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('P'));
    await shiftClick(user, row('S'));
    await user.click(barButton('Complete'));
    expect(find('P').checked && find('S').checked).toBe(true);
    expect(await screen.findByText('Completed 2 tasks')).toBeInTheDocument();
  });

  it('offers "Mark not done" when every selected task is done', async () => {
    setShowCompleted(list, true);
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Complete'));
    // Finished tasks stay in the list's Completed section, and stay selected.
    expect(bar()).toHaveTextContent('2 selected');
    await user.click(barButton('Mark not done'));
    expect([find('A').checked, find('B').checked]).toEqual([false, false]);
    expect(await screen.findByText('Marked 2 tasks not done')).toBeInTheDocument();
  });

  it('sets the date, keeping times, and clears it with "No date"', async () => {
    add('A', { dueDate: today, dueTime: '09:30' });
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Date'));
    await user.click(
      await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Tomorrow' }),
    );
    expect(find('A')).toMatchObject({ dueDate: tomorrow, dueTime: '09:30' });
    expect(find('B').dueDate).toBe(tomorrow);
    expect(await screen.findByText('Rescheduled 2 tasks')).toBeInTheDocument();
    // The group is still selected, and focus is not lost to the page.
    expect(bar()).toHaveTextContent('2 selected');
    // Focus ends on the last-picked row.
    expect(row('B')).toHaveFocus();
    await user.click(barButton('Date'));
    await user.click(await screen.findByRole('button', { name: 'No date' }));
    expect(find('A')).toMatchObject({ dueDate: null, dueTime: null });
    expect(find('B').dueDate).toBeNull();
  });

  it('sets the priority', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user, 'A', 'C');
    await user.click(barButton('Priority'));
    await user.click(await screen.findByRole('menuitem', { name: 'P1' }));
    expect([find('A').priority, find('B').priority, find('C').priority]).toEqual([1, 1, 1]);
    expect(await screen.findByText('Priority set on 3 tasks')).toBeInTheDocument();
  });

  // Bug it prevents: deleting from the bar left keyboard focus on <body>.
  it('deletes the selected tasks, keeps focus on a remaining row, and Undo brings them back', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Delete'));
    expect(screen.queryByRole('listitem', { name: 'A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'B' })).not.toBeInTheDocument();
    expect(await screen.findByText('Deleted 2 tasks')).toBeInTheDocument();
    await waitFor(() => expect(row('C')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(row('A')).toBeInTheDocument();
    expect(row('B')).toBeInTheDocument();
  });

  // Bug it prevents: deleting every task left focus on <body> with nowhere to type.
  it('puts focus in the quick-add field when no row is left', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Delete'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a task' })).toHaveFocus());
  });

  it('clears the selection with the close button', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Clear selection'));
    expect(bar()).not.toBeInTheDocument();
    expect(selected()).toEqual([]);
  });

  it('moves the selected tasks to another list through the picker', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await selectTwo(user);
    await user.click(barButton('Move to'));
    const dialog = await screen.findByRole('dialog', { name: 'Move 2 tasks to…' });
    await user.click(within(dialog).getByRole('option', { name: /Other/ }));
    expect([find('A').listId, find('B').listId, find('C').listId]).toEqual([other, other, list]);
    expect(await screen.findByText('Moved 2 tasks to Other')).toBeInTheDocument();
    await waitFor(() => expect(row('C')).toHaveFocus());
  });
});

describe('one-key shortcuts on a focused task', () => {
  it('E completes, 1-4 set the priority, T opens the due-date picker', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('2');
    expect(find('A').priority).toBe(2);
    await user.keyboard('1');
    expect(find('A').priority).toBe(1);
    await user.keyboard('4');
    expect(find('A').priority).toBe(0);
    await user.keyboard('t');
    expect(useUI.getState().duePickerFor).toBe(find('A').id);
    await user.click(row('A'));
    await user.keyboard('e');
    expect(find('A').checked).toBe(true);
    expect(row('B')).toHaveFocus();
  });

  // Bug it prevents: V opened nothing, or let the user "move" a task to the list it is in.
  it('V opens the move picker: filter, disabled current list, Enter to move', async () => {
    add('A');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('v');
    const dialog = await screen.findByRole('dialog', { name: 'Move task to…' });
    const current = within(dialog).getByRole('option', { name: /Tasks/ });
    expect(current).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('option', { name: /Other/ })).toBeInTheDocument();
    await user.keyboard('zzz');
    expect(within(dialog).queryByRole('option')).not.toBeInTheDocument();
    expect(within(dialog).getByText('No lists match.')).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('combobox', { name: 'Find a list' }));
    await user.keyboard('oth');
    expect(within(dialog).queryByRole('option', { name: /Tasks/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(find('A').listId).toBe(other);
    expect(await screen.findByText('Moved to Other')).toBeInTheDocument();
  });

  it('Escape closes the move picker without moving anything', async () => {
    add('A');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('v');
    await screen.findByRole('dialog', { name: 'Move task to…' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(find('A').listId).toBe(list);
  });

  it('acts on the whole selection when several are selected', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    await user.keyboard('3');
    expect([find('A').priority, find('B').priority, find('C').priority]).toEqual([3, 3, 0]);
    // T opens the bar's Date popover.
    await user.keyboard('t');
    const popover = await screen.findByRole('dialog');
    await user.click(await within(popover).findByRole('button', { name: 'Today' }));
    expect(find('A').dueDate).toBe(today);
    expect(find('B').dueDate).toBe(today);
    expect(find('C').dueDate).toBeNull();
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    await user.keyboard('e');
    expect(find('A').checked && find('B').checked).toBe(true);
    expect(find('C').checked).toBe(false);
    // Finished tasks stay in the list's Completed section, so they stay selected.
    expect(bar()).toHaveTextContent('2 selected');
  });

  it('Space and Delete act on the whole selection', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    await user.keyboard(' ');
    expect([find('A').checked, find('B').checked, find('C').checked]).toEqual([true, true, false]);
    await user.click(row('C'));
    await shiftClick(user, row('A'));
    await user.keyboard('{Delete}');
    expect(find('A').deletedAt).not.toBeNull();
    expect(find('C').deletedAt).not.toBeNull();
  });

  it('V with several selected moves them all', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    await user.keyboard('v');
    const dialog = await screen.findByRole('dialog', { name: 'Move 2 tasks to…' });
    await user.click(within(dialog).getByRole('option', { name: /Other/ }));
    expect([find('A').listId, find('B').listId]).toEqual([other, other]);
  });

  // Bug it prevents: Shift+A did nothing, or put the new task at the end.
  it('Shift+A opens the new-task field at the top of the list', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('B'));
    await user.keyboard('{Shift>}a{/Shift}');
    const field = screen.getByRole('textbox', { name: 'New task' });
    expect(field).toHaveFocus();
    await user.keyboard('First{Enter}');
    const names = within(screen.getByRole('list', { name: 'Tasks' }))
      .getAllByRole('listitem')
      .map((el) => el.getAttribute('aria-label'));
    // (The field for the next task sits after "First" and has no name.)
    expect(names.filter(Boolean)).toEqual(['First', 'A', 'B']);
  });

  // Bug it prevents: letters typed into a title or the quick-add field fired the shortcuts.
  it('ignores the keys while typing in a title or in quick add', async () => {
    const id = add('A');
    const user = userEvent.setup();
    render(<App />);
    await user.click(rowText('A'));
    await user.keyboard('e1tv');
    expect(useData.getState().tables.items[id]).toMatchObject({
      text: 'Ae1tv',
      checked: false,
      priority: 0,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useUI.getState().duePickerFor).toBeNull();
    const field = screen.getByRole('textbox', { name: 'Add a task' });
    await user.click(field);
    await user.keyboard('{Shift>}A{/Shift}ev3');
    expect(field).toHaveValue('Aev3');
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument();
  });

  it('ignores the keys with Ctrl held', async () => {
    add('A');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await user.keyboard('{Control>}e{/Control}');
    expect(find('A').checked).toBe(false);
  });
});

describe('a read-only list', () => {
  // Bug it prevents: tasks in an archived list could be changed with the new shortcuts.
  it('does not allow selecting several or the shortcuts', async () => {
    add('A');
    add('B');
    archiveList(list);
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('A'));
    await shiftClick(user, row('B'));
    expect(bar()).not.toBeInTheDocument();
    expect(useUI.getState().multiSelectedIds).toEqual([]);
    await user.click(row('A'));
    await user.keyboard('1e');
    await user.keyboard('{Control>}a{/Control}');
    expect(find('A')).toMatchObject({ priority: 0, checked: false });
    expect(bar()).not.toBeInTheDocument();
  });
});

describe('selecting several tasks in Today', () => {
  const dueToday = (text: string, listId = list) => createItem(listId, { text, dueDate: today });

  beforeEach(() => {
    useUI.setState({ view: { kind: 'today' } });
  });

  it('selects a range, completes it with E, and keeps focus out of <body>', async () => {
    dueToday('T1');
    dueToday('T2', other);
    dueToday('T3');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('T1'));
    // Today orders the rows by list, so the range runs to whichever row is last.
    const rows = screen.getAllByRole('listitem');
    await shiftClick(user, rows[rows.length - 1]);
    expect(bar()).toHaveTextContent('3 selected');
    await user.keyboard('e');
    expect(await screen.findByText('Completed 3 tasks')).toBeInTheDocument();
    expect(find('T1').checked && find('T2').checked && find('T3').checked).toBe(true);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Add a task' })).toHaveFocus());
    expect(bar()).not.toBeInTheDocument();
  });

  it('selects all with Mod+A and sets the priority with a key', async () => {
    dueToday('T1');
    dueToday('T2', other);
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('T1'));
    await user.keyboard('{Control>}a{/Control}');
    expect(selected()).toEqual(['T1', 'T2']);
    await user.keyboard('1');
    expect([find('T1').priority, find('T2').priority]).toEqual([1, 1]);
    await user.keyboard('{Escape}');
    expect(selected()).toEqual([]);
  });

  it('Shift+A does nothing here, and V moves the task', async () => {
    dueToday('T1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('T1'));
    await user.keyboard('{Shift>}a{/Shift}');
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument();
    await user.keyboard('v');
    const dialog = await screen.findByRole('dialog', { name: 'Move task to…' });
    await user.click(within(dialog).getByRole('option', { name: /Other/ }));
    expect(find('T1').listId).toBe(other);
  });
});
