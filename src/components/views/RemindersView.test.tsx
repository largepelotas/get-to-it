import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, todayKey } from '@/lib/dates';
import { fireTime } from '@/lib/reminders';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { TooltipProvider } from '@/components/ui';
import { ReminderField } from '@/components/items/ReminderField';
import { addReminder, markFired, setReminderConstant } from '@/store/actions/reminders';
import { resetForTests, undo, useData } from '@/store/data';
import { navigate, openDetails, useUI } from '@/store/ui';

let work: string;
const today = todayKey();
const tomorrow = addDaysKey(today, 1);
const yesterday = addDaysKey(today, -1);

// Dialogs load lazily; loaded up front they open without suspending.
beforeAll(() => preloadDialogs());

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
});

const reminders = () => Object.values(useData.getState().tables.reminders);
const section = (name: string) => within(screen.getByRole('region', { name }));

/** A task whose reminder has gone off and waits in the inbox. */
function firedTask(text: string) {
  const id = createItem(work, { text, dueDate: yesterday, dueTime: '10:00' })!;
  const r = addReminder(id, { kind: 'relative', offsetMinutes: 0 })!;
  const { tables, settings } = useData.getState();
  markFired([
    { id: r, at: fireTime(tables.reminders[r], tables.items[id], settings.allDayReminderTime)! },
  ]);
  return { id, r };
}

describe('Reminders in task details', () => {
  it('adds a preset reminder and removes it', async () => {
    const user = userEvent.setup();
    const id = createItem(work, { text: 'Send deck', dueDate: tomorrow, dueTime: '15:00' })!;
    navigate({ kind: 'list', listId: work });
    openDetails(id);
    render(<App />);
    const details = within(screen.getByRole('complementary', { name: 'Task details' }));

    await user.click(details.getByRole('button', { name: 'Add reminder' }));
    await user.click(await screen.findByRole('menuitem', { name: '15 minutes before' }));
    expect(reminders()).toMatchObject([{ itemId: id, kind: 'relative', offsetMinutes: 15 }]);
    const list = within(details.getByRole('list', { name: 'Reminders' }));
    expect(list.getByText(/15 minutes before/)).toBeInTheDocument();

    await user.click(list.getByRole('button', { name: 'Remove reminder 15 minutes before' }));
    expect(reminders()).toEqual([]);
  });

  it('adds a custom reminder to an undated task', async () => {
    const user = userEvent.setup();
    const id = createItem(work, { text: 'Renew passport' })!;
    navigate({ kind: 'list', listId: work });
    openDetails(id);
    render(<App />);
    const details = within(screen.getByRole('complementary', { name: 'Task details' }));

    await user.click(details.getByRole('button', { name: 'Add reminder' }));
    expect(await screen.findByRole('menuitem', { name: 'On the day' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Custom date and time…' }));
    const field = await details.findByLabelText('Reminder date and time');
    await user.clear(field);
    await user.type(field, `${tomorrow}T08:15`);
    await user.click(details.getByRole('button', { name: 'Add' }));
    expect(reminders()).toMatchObject([
      { kind: 'absolute', at: new Date(`${tomorrow}T08:15`).getTime() },
    ]);
  });
});

describe('Reminders view', () => {
  it('lists delivered reminders with a count, and dismisses them', async () => {
    const user = userEvent.setup();
    const { r } = firedTask('Call Sam');
    createItem(work, { text: 'Later', dueDate: tomorrow, dueTime: '09:00' });
    addReminder(
      Object.values(useData.getState().tables.items).find((i) => i.text === 'Later')!.id,
      { kind: 'relative', offsetMinutes: 0 },
    );
    render(<App />);
    const nav = screen.getByRole('button', { name: /^Reminders/ });
    expect(within(nav).getByText('1')).toBeVisible();

    await user.click(nav);
    expect(section('Reminded').getByRole('listitem', { name: 'Call Sam' })).toBeInTheDocument();
    expect(section('Coming up').getByRole('listitem', { name: 'Later' })).toBeInTheDocument();

    await user.click(section('Reminded').getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Reminded' })).not.toBeInTheDocument();
    expect(useData.getState().tables.reminders[r].dismissedFor).not.toBeNull();
  });

  it('snoozes a reminder into Coming up', async () => {
    const user = userEvent.setup();
    firedTask('Call Sam');
    navigate({ kind: 'reminders' });
    render(<App />);
    await user.click(section('Reminded').getByRole('button', { name: 'Snooze' }));
    await user.click(await screen.findByRole('menuitem', { name: '1 hour' }));
    expect(screen.queryByRole('region', { name: 'Reminded' })).not.toBeInTheDocument();
    const row = section('Coming up').getByRole('listitem', { name: 'Call Sam' });
    expect(within(row).getByText(/snoozed/)).toBeInTheDocument();
  });

  it('completes the task from its reminder', async () => {
    const user = userEvent.setup();
    const { id } = firedTask('Call Sam');
    navigate({ kind: 'reminders' });
    render(<App />);
    await user.click(section('Reminded').getByRole('button', { name: 'Complete' }));
    expect(useData.getState().tables.items[id].checked).toBe(true);
    expect(screen.getByText('No reminders')).toBeInTheDocument();
  });

  it('collects reminders missed while the app was closed', async () => {
    const id = createItem(work, { text: 'Water plants', dueDate: yesterday, dueTime: '18:00' })!;
    addReminder(id, { kind: 'relative', offsetMinutes: 0 });
    render(<App />);
    expect(await screen.findByText('Missed reminder')).toBeInTheDocument();
    const nav = screen.getByRole('button', { name: /^Reminders/ });
    expect(within(nav).getByText('1')).toBeVisible();
  });
});

describe('Settings', () => {
  it('changes reminder and tray settings', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Settings…/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Settings' }));

    await user.click(dialog.getByLabelText('Keep running in the tray when the window is closed'));
    expect(useData.getState().settings.closeToTray).toBe(false);

    const time = dialog.getByLabelText('Remind about all-day tasks at');
    await user.clear(time);
    await user.type(time, '07:30');
    expect(useData.getState().settings.allDayReminderTime).toBe('07:30');

    expect(dialog.getByLabelText('Open at login')).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Constant reminders', () => {
  const setup = (readOnly = false) => {
    const id = createItem(work, { text: 'Send deck', dueDate: tomorrow, dueTime: '15:00' })!;
    const r = addReminder(id, { kind: 'relative', offsetMinutes: 15 })!;
    const item = useData.getState().tables.items[id];
    render(
      <TooltipProvider>
        <ReminderField item={item} readOnly={readOnly} />
      </TooltipProvider>,
    );
    return r;
  };

  it('turns on and off from the reminder row, as one undoable step each', async () => {
    const user = userEvent.setup();
    const r = setup();
    const button = screen.getByRole('button', { name: 'Keep reminding' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(useData.getState().tables.reminders[r].constant).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Repeats until dismissed/)).toBeInTheDocument();

    // Bug prevented: toggling taking more than one Undo, or none.
    const steps = useData.getState().past.length;
    act(() => void undo());
    expect(useData.getState().past.length).toBe(steps - 1);
    expect(useData.getState().tables.reminders[r].constant).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Repeats until dismissed/)).not.toBeInTheDocument();
  });

  it('shows the state without a toggle when read-only', () => {
    const r = setup(true);
    expect(screen.queryByRole('button', { name: 'Keep reminding' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Repeats until dismissed/)).not.toBeInTheDocument();
    act(() => setReminderConstant(r, true));
    expect(screen.getByText(/Repeats until dismissed/)).toBeInTheDocument();
  });

  it('marks a constant reminder in the inbox', async () => {
    const { r } = firedTask('Call Sam');
    firedTask('Water plants');
    setReminderConstant(r, true);
    navigate({ kind: 'reminders' });
    render(<App />);
    expect(
      within(section('Reminded').getByRole('listitem', { name: 'Call Sam' })).getByText('Repeats'),
    ).toBeVisible();
    expect(
      within(section('Reminded').getByRole('listitem', { name: 'Water plants' })).queryByText(
        'Repeats',
      ),
    ).not.toBeInTheDocument();
  });
});
