import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { homeView } from './commands';
import { MemoryRepository } from './data/memory';
import { resetForTests, useData } from './store/data';
import { seedIfNeeded } from './store/seed';
import { navigate, useUI } from './store/ui';

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({ view: { kind: 'today' }, dialog: null, renaming: null, selectedItemId: null });
  seedIfNeeded();
  navigate(homeView());
});

const sidebar = () => within(screen.getByRole('navigation', { name: 'Lists' }));

describe('App', () => {
  it('opens on the default list with the starter content in the sidebar', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: 'List name' })).toHaveValue('Inbox');
    for (const name of ['Inbox', 'Groceries', 'Welcome', 'Work']) {
      expect(sidebar().getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('creates a list from the New list dialog and opens it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(sidebar().getByRole('button', { name: 'New list' }));
    const dialog = screen.getByRole('dialog', { name: 'New list' });
    await user.click(within(dialog).getByRole('radio', { name: 'Note' }));
    await user.type(within(dialog).getByLabelText('Name'), 'Ideas');
    await user.selectOptions(within(dialog).getByLabelText('Folder'), 'Work');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'List name' })).toHaveValue('Ideas');
    const list = Object.values(useData.getState().tables.lists).find((l) => l.title === 'Ideas')!;
    expect(list.type).toBe('note');
    expect(useData.getState().tables.folders[list.folderId!].name).toBe('Work');
  });

  it('undoes with the keyboard, but not while typing in a field', async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = screen.getByRole('textbox', { name: 'List name' });
    await user.clear(title);
    await user.type(title, 'Tasks{Enter}');
    expect(sidebar().getByRole('button', { name: 'Tasks' })).toBeInTheDocument();

    await user.click(title);
    await user.keyboard('{Control>}z{/Control}');
    expect(useData.getState().past).toHaveLength(1);

    act(() => title.blur());
    await user.keyboard('{Control>}z{/Control}');
    expect(sidebar().getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('switches to the Trash and back to the list after restoring', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      const inbox = useData.getState().settings.defaultListId!;
      useUI.setState({ view: { kind: 'list', listId: inbox } });
    });
    await user.click(screen.getByRole('button', { name: 'List actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to Trash' }));

    expect(sidebar().queryByRole('button', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Trash/ }));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(sidebar().getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  });
});
