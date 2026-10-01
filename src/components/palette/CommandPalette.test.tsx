import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { App } from '@/App';
import { homeView } from '@/commands';
import { MemoryRepository } from '@/data/memory';
import { docFromText } from '@/lib/richText';
import { createItem, setItemCollapsed } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { setNoteContent } from '@/store/actions/notes';
import { resetForTests, useData } from '@/store/data';
import { seedIfNeeded } from '@/store/seed';
import { navigate, useUI } from '@/store/ui';

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
    reveal: null,
  });
  seedIfNeeded();
  navigate(homeView());
});

const listName = () => screen.getByRole('textbox', { name: 'List name' });
const palette = () => screen.getByRole('dialog', { name: 'Search and commands' });

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}');
  return within(palette());
}

describe('command palette', () => {
  it('opens with Ctrl+K, even while typing, and closes with it again', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('textbox', { name: 'Add a task' }));
    const p = await openPalette(user);
    expect(p.getByRole('combobox')).toHaveFocus();
    // With no query: the lists, then the commands.
    expect(p.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(p.getByRole('option', { name: /New list/ })).toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('finds a task in another list and opens it with its details', async () => {
    const user = userEvent.setup();
    const work = createList({ type: 'todo', title: 'Projects' });
    const parent = createItem(work, { text: 'Launch plan' })!;
    createItem(work, { text: 'Book the venue', parentId: parent });
    setItemCollapsed(parent, true);
    render(<App />);

    const p = await openPalette(user);
    await user.keyboard('venue');
    const option = p.getByRole('option', { name: /Book the venue/ });
    expect(option).toHaveTextContent('Projects');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(listName()).toHaveValue('Projects'));
    const venue = useData.getState().tables.items;
    const id = Object.values(venue).find((i) => i.text === 'Book the venue')!.id;
    expect(useUI.getState()).toMatchObject({ selectedItemId: id, detailsOpen: true });
    // Its collapsed parent opened so the row can be shown and focused.
    expect(useData.getState().tables.items[parent].collapsed).toBe(false);
    await waitFor(() =>
      expect(document.activeElement?.closest('[data-item-id]')).toHaveAttribute('data-item-id', id),
    );
  });

  it('finds notes by their text and opens them', async () => {
    const user = userEvent.setup();
    const note = createList({ type: 'note', title: 'Retro' });
    setNoteContent(note, docFromText('What went well\nThe quarterly offsite'));
    render(<App />);

    const p = await openPalette(user);
    await user.keyboard('offsite');
    const option = p.getByRole('option', { name: /Retro/ });
    expect(within(option).getByText('offsite')).toContainHTML('mark');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(listName()).toHaveValue('Retro'));
  });

  it('runs commands, which match by the start of their words', async () => {
    const user = userEvent.setup();
    render(<App />);
    const p = await openPalette(user);
    await user.keyboard('sett');
    expect(p.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Settings…'),
    ]);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('puts the group with the best match first', async () => {
    const user = userEvent.setup();
    const inbox = useData.getState().settings.defaultListId!;
    createItem(inbox, { text: 'Send report' });
    // The Welcome note mentions a report only in its text. Open it, so the copy command
    // is “Copy “Welcome” as Markdown”.
    const welcome = Object.values(useData.getState().tables.lists).find(
      (l) => l.title === 'Welcome',
    )!;
    navigate({ kind: 'list', listId: welcome.id });
    render(<App />);
    const p = await openPalette(user);
    await user.keyboard('report');
    const headings = [...palette().querySelectorAll('[cmdk-group-heading]')].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(['Tasks and items', 'Notes']);
    // A list's title in a command's label doesn't make the command match.
    await user.clear(p.getByRole('combobox'));
    await user.keyboard('welc');
    expect(p.queryByRole('option', { name: /Copy/ })).not.toBeInTheDocument();
    await user.clear(p.getByRole('combobox'));
    await user.keyboard('copy');
    expect(p.getByRole('option', { name: /Copy “Welcome” as Markdown/ })).toBeInTheDocument();
    expect(p.getByRole('option', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('keeps the first result selected as groups change order while typing', async () => {
    const user = userEvent.setup();
    const inbox = useData.getState().settings.defaultListId!;
    createItem(inbox, { text: 'Send report' });
    render(<App />);
    const p = await openPalette(user);
    // "re" matches the Welcome note first; "report" puts the task first.
    await user.keyboard('report');
    expect(p.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const id = Object.values(useData.getState().tables.items).find(
      (i) => i.text === 'Send report',
    )!.id;
    expect(useUI.getState().selectedItemId).toBe(id);
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    const p = await openPalette(user);
    await user.keyboard('zzqx');
    expect(p.getByText('Nothing found for “zzqx”.')).toBeInTheDocument();
  });
});

describe('app shortcuts', () => {
  it('goes to views, opens dialogs and focuses quick-add', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}2{/Control}');
    expect(useUI.getState().view).toEqual({ kind: 'upcoming' });
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.getByRole('textbox', { name: 'Add a task' })).toHaveFocus();
    await user.keyboard('{Control>}/{/Control}');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    // Other shortcuts wait while a dialog is open.
    await user.keyboard('{Control>}1{/Control}');
    expect(useUI.getState().view).toEqual({ kind: 'upcoming' });
    await user.keyboard('{Escape}{Control>}1{/Control}');
    expect(useUI.getState().view).toEqual({ kind: 'today' });
    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}');
    expect(screen.getByRole('dialog', { name: 'New list' })).toBeInTheDocument();
  });

  it('copies the open list as Markdown', async () => {
    const user = userEvent.setup();
    const inbox = useData.getState().settings.defaultListId!;
    act(() => void createItem(inbox, { text: 'Write the report', priority: 1 }));
    render(<App />);
    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}');
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe('# Inbox\n\n- [ ] Write the report (P1)\n'),
    );
    expect(await screen.findByText('Copied “Inbox” as Markdown')).toBeInTheDocument();
  });

  it('opens the due-date picker for the selected task with Ctrl+D', async () => {
    const user = userEvent.setup();
    const inbox = useData.getState().settings.defaultListId!;
    const id = createItem(inbox, { text: 'Plan the week' })!;
    render(<App />);
    await user.click(screen.getByDisplayValue('Plan the week'));
    await user.keyboard('{Control>}d{/Control}');
    expect(useUI.getState()).toMatchObject({ selectedItemId: id, duePickerFor: id });
  });
});
