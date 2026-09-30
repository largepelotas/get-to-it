import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, setSetting, useData } from '@/store/data';
import { navigate, openList, useUI } from '@/store/ui';

let work: string;
let home: string;
const today = todayKey();
const tomorrow = addDaysKey(today, 1);
const yesterday = addDaysKey(today, -1);

beforeEach(() => {
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

const allItems = () => Object.values(useData.getState().tables.items);
const find = (text: string) => allItems().find((i) => i.text === text) as Item;
const row = (text: string) => screen.getByRole('listitem', { name: text });
const section = (name: string) => within(screen.getByRole('region', { name }));

describe('Today', () => {
  it('shows overdue and due-today tasks from every list, with their list', () => {
    createItem(work, { text: 'Late report', dueDate: yesterday });
    createItem(home, { text: 'Call plumber', dueDate: today, dueTime: '14:00' });
    createItem(work, { text: 'Tomorrow thing', dueDate: tomorrow });
    createItem(work, { text: 'No date' });
    render(<App />);
    expect(section('Overdue').getByRole('listitem', { name: 'Late report' })).toBeInTheDocument();
    const plumber = section('Today').getByRole('listitem', { name: 'Call plumber' });
    expect(within(plumber).getByText('Home')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Tomorrow thing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'No date' })).not.toBeInTheDocument();
    // The sidebar counts what Today shows.
    expect(within(screen.getByRole('button', { name: /^Today/ })).getByText('2')).toBeVisible();
  });

  it('adds tasks due today to the default list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Buy stamps{Enter}');
    expect(find('Buy stamps')).toMatchObject({ listId: home, dueDate: today });
    expect(row('Buy stamps')).toBeInTheDocument();
  });

  it('completes a task with an Undo toast', async () => {
    createItem(work, { text: 'Send invoice', dueDate: today });
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Send invoice')).getByRole('checkbox'));
    expect(screen.queryByRole('listitem', { name: 'Send invoice' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(find('Send invoice').checked).toBe(false);
    expect(row('Send invoice')).toBeInTheDocument();
  });

  it('moves overdue tasks to today', async () => {
    createItem(work, { text: 'Late A', dueDate: addDaysKey(today, -3), dueTime: '09:00' });
    createItem(home, { text: 'Late B', dueDate: yesterday });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Move to today' }));
    expect(find('Late A')).toMatchObject({ dueDate: today, dueTime: '09:00' });
    expect(find('Late B').dueDate).toBe(today);
    expect(screen.queryByRole('region', { name: 'Overdue' })).not.toBeInTheDocument();
  });
});

describe('Upcoming', () => {
  it('groups future tasks by day and adds tasks for tomorrow', async () => {
    createItem(work, { text: 'Later', dueDate: addDaysKey(today, 5) });
    createItem(home, { text: 'Soon', dueDate: tomorrow });
    createItem(work, { text: 'Now', dueDate: today });
    navigate({ kind: 'upcoming' });
    const user = userEvent.setup();
    render(<App />);
    const groups = within(screen.getByRole('main')).getAllByRole('region');
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByRole('heading')).toHaveTextContent(/^Tomorrow · /);
    expect(within(groups[0]).getByRole('listitem', { name: 'Soon' })).toBeInTheDocument();
    expect(within(groups[1]).getByRole('listitem', { name: 'Later' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Now' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Pack bags{Enter}');
    expect(find('Pack bags').dueDate).toBe(tomorrow);
  });
});

describe('due-date picker', () => {
  it('sets a date, a time and a repeat from the details panel', async () => {
    createItem(work, { text: 'Standup' });
    openList(work);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Standup')).getByRole('button', { name: 'Open details' }));
    const panel = within(screen.getByRole('complementary', { name: 'Task details' }));

    await user.click(panel.getByRole('button', { name: 'Add due date' }));
    await user.click(await screen.findByRole('button', { name: /^Tomorrow/ }));
    expect(find('Standup').dueDate).toBe(tomorrow);
    // Choosing a day closes the picker.
    expect(screen.queryByRole('button', { name: /^Tomorrow/ })).not.toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: /^Due Tomorrow/ }));
    await user.type(screen.getByLabelText('Time'), '09:30');
    expect(find('Standup').dueTime).toBe('09:30');
    await user.selectOptions(screen.getByLabelText('Repeat'), 'daily');
    expect(find('Standup').recurrence).toEqual({ freq: 'daily', interval: 1, mode: 'schedule' });

    await user.selectOptions(screen.getByLabelText('Repeat'), 'custom');
    await user.selectOptions(screen.getByLabelText('Repeat from'), 'completion');
    await user.clear(screen.getByLabelText('Repeat every'));
    await user.type(screen.getByLabelText('Repeat every'), '3');
    expect(find('Standup').recurrence).toEqual({ freq: 'daily', interval: 3, mode: 'completion' });
    expect(panel.getByText('3 days after completion')).toBeInTheDocument();
  });

  it('sets a quick date from the row menu', async () => {
    createItem(work, { text: 'Report' });
    openList(work);
    const user = userEvent.setup();
    render(<App />);
    await user.pointer({ keys: '[MouseRight]', target: row('Report') });
    await user.click(screen.getByRole('menuitem', { name: 'Due date' }));
    // Into the submenu, whose first entry is Today.
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Today' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(find('Report').dueDate).toBe(today);
    expect(within(row('Report')).getByText('Today')).toBeInTheDocument();
  });

  it('moves a repeating task to its next date and records the completion', async () => {
    createItem(work, {
      text: 'Water plants',
      dueDate: today,
      recurrence: { freq: 'daily', interval: 2, mode: 'schedule' },
    });
    openList(work);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Water plants')).getByRole('checkbox'));
    expect(find('Water plants')).toMatchObject({ checked: false, dueDate: addDaysKey(today, 2) });
    expect(await screen.findByText(/“Water plants” is next due/)).toBeInTheDocument();

    await user.click(within(row('Water plants')).getByRole('button', { name: 'Open details' }));
    const history = within(screen.getByRole('list', { name: 'Completion history' }));
    expect(history.getAllByRole('listitem')).toHaveLength(1);
  });
});
