import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { todayKey } from '@/lib/dates';
import { createList } from '@/store/actions/lists';
import { resetForTests, undo, useData } from '@/store/data';
import { openList, useUI } from '@/store/ui';

let inbox: string;
let work: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({ view: { kind: 'today' }, dialog: null, renaming: null, selectedItemId: null });
  inbox = createList({ type: 'todo', title: 'Inbox' });
  work = createList({ type: 'todo', title: 'Work' });
  openList(inbox);
});

const tasks = () =>
  Object.values(useData.getState().tables.items)
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    .map((i) => `${i.text}@${useData.getState().tables.lists[i.listId].title}`);
const reminders = () => Object.values(useData.getState().tables.reminders);
const field = () => screen.getByRole('textbox', { name: 'Add a task' });
const openDialog = (user: ReturnType<typeof userEvent.setup>) =>
  user.keyboard('{Control>}{Shift>}a{/Shift}{/Control}');

describe('quick add: pasting several lines', () => {
  // Bug: pasting a list dumped every line into one task title.
  it('offers one task per line, and adds them with the button as one undo step', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('- [ ] One\n- Two\n3. Three p1');
    expect(field()).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Add 3 tasks' }));
    expect(tasks().sort()).toEqual(['One@Inbox', 'Three@Inbox', 'Two@Inbox']);
    expect(screen.queryByRole('button', { name: 'Paste as one task' })).not.toBeInTheDocument();
    undo();
    expect(tasks()).toEqual([]);
  });

  it('keeps what was typed when the lines are added with Enter', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Draft');
    await user.paste('One\nTwo');
    await user.keyboard('{Enter}');
    expect(tasks()).toEqual(['One@Inbox', 'Two@Inbox']);
    expect(field()).toHaveValue('Draft');
  });

  it('pastes as one task at the cursor, replacing the selection', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'ab XY cd');
    (field() as HTMLInputElement).setSelectionRange(3, 5);
    await user.paste('One\n\nTwo');
    await user.click(screen.getByRole('button', { name: 'Paste as one task' }));
    expect(field()).toHaveValue('ab One Two cd');
    expect(tasks()).toEqual([]);
  });

  it('dismisses the bar with Escape or typing, without pasting', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('One\nTwo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Add 2 tasks' })).not.toBeInTheDocument();
    expect(field()).toHaveValue('');
    await user.paste('One\nTwo');
    await user.keyboard('x');
    expect(screen.queryByRole('button', { name: 'Add 2 tasks' })).not.toBeInTheDocument();
    expect(tasks()).toEqual([]);
  });

  // Bug: Escape did nothing while a bar button had focus.
  it('dismisses the bar with Escape while one of its buttons has focus', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('One\nTwo');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Add 2 tasks' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Add 2 tasks' })).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(tasks()).toEqual([]);
  });

  it('pastes a single line as normal', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('Just one\n');
    expect(field()).toHaveValue('Just one');
    expect(screen.queryByRole('group', { name: 'Pasted lines' })).not.toBeInTheDocument();
  });

  it('only offers pasting as one task beyond 200 lines', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste(Array.from({ length: 201 }, (_, i) => `Task ${i}`).join('\n'));
    expect(screen.queryByRole('button', { name: /^Add \d+ tasks$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/too many/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paste as one task' })).toBeInTheDocument();
  });

  it('previews #List and reminders, and files the task', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Call Sam #work tomorrow 3pm !30min');
    expect(screen.getByText('#Work')).toBeInTheDocument();
    expect(screen.getByText('Remind 30 min before')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(tasks()).toEqual(['Call Sam@Work']);
    expect(reminders()).toHaveLength(1);
  });
});

describe('quick-add dialog', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'Add a task' });
  const picker = () => within(dialog()).getByRole('combobox', { name: 'List' });
  const dialogField = () => within(dialog()).getByRole('textbox', { name: 'Add a task' });

  // Bug: Mod+N did nothing in views without a field.
  it('opens from Mod+Shift+A, and from Mod+N when the view has no field', async () => {
    const user = userEvent.setup({ delay: null });
    useUI.setState({ view: { kind: 'reminders' } });
    render(<App />);
    await user.keyboard('{Control>}n{/Control}');
    expect(dialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openList(inbox);
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
    await openDialog(user);
    expect(dialog()).toBeInTheDocument();
    expect(dialogField()).toHaveFocus();
  });

  it('starts on the open list, else the default list, else the Inbox', async () => {
    const user = userEvent.setup({ delay: null });
    openList(work);
    const first = render(<App />);
    await openDialog(user);
    expect(picker()).toHaveValue(work);
    first.unmount();

    useUI.setState({ view: { kind: 'reminders' }, dialog: null });
    useData.setState((s) => ({ settings: { ...s.settings, defaultListId: work } }));
    const second = render(<App />);
    await openDialog(user);
    expect(picker()).toHaveValue(work);
    second.unmount();

    useUI.setState({ dialog: null });
    useData.setState((s) => ({ settings: { ...s.settings, defaultListId: null } }));
    render(<App />);
    await openDialog(user);
    expect(picker()).toHaveValue(inbox);
  });

  it('adds to the chosen list and closes; Escape adds nothing', async () => {
    const user = userEvent.setup({ delay: null });
    useUI.setState({ view: { kind: 'reminders' } });
    render(<App />);
    await openDialog(user);
    await user.type(dialogField(), 'Nothing{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tasks()).toEqual([]);

    await openDialog(user);
    await user.selectOptions(picker(), work);
    await user.type(dialogField(), 'Call Sam{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tasks()).toEqual(['Call Sam@Work']);
  });

  // Bug: the picker could override a "#List" typed in the text.
  it('lets a #List in the text beat the picker', async () => {
    const user = userEvent.setup({ delay: null });
    useUI.setState({ view: { kind: 'reminders' } });
    render(<App />);
    await openDialog(user);
    await user.type(dialogField(), 'Call Sam #work{Enter}');
    expect(tasks()).toEqual(['Call Sam@Work']);
  });

  it('gives new tasks today as the due date when opened from Today', async () => {
    const user = userEvent.setup({ delay: null });
    useUI.setState({ view: { kind: 'today' } });
    render(<App />);
    await openDialog(user);
    await user.type(dialogField(), 'Water plants{Enter}');
    expect(Object.values(useData.getState().tables.items)[0].dueDate).toBe(todayKey());
  });

  it('adds pasted lines from the dialog, with Escape first dismissing the bar', async () => {
    const user = userEvent.setup({ delay: null });
    useUI.setState({ view: { kind: 'reminders' } });
    render(<App />);
    await openDialog(user);
    await user.click(dialogField());
    await user.paste('One\nTwo');
    await user.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();
    await user.paste('One\nTwo');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(tasks()).toEqual(['One@Inbox', 'Two@Inbox']);
  });

  // Bug: a paste bar in the list's own field behind the dialog kept Escape from closing it.
  it('closes on Escape even when the list behind has a paste bar open', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('One\nTwo');
    expect(screen.getByRole('button', { name: 'Add 2 tasks' })).toBeInTheDocument();
    await openDialog(user);
    expect(dialog()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
