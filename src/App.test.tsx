import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { homeView, newFolder } from './commands';
import { MemoryRepository } from './data/memory';
import { resetForTests, useData } from './store/data';
import { seedIfNeeded } from './store/seed';
import { createList } from './store/actions/lists';
import { navigate, openDialog, useUI } from './store/ui';

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

  it('changes the default list in Settings', async () => {
    const user = userEvent.setup();
    const work = Object.values(useData.getState().tables.folders)[0].id;
    const team = createList({ type: 'todo', title: 'Team', folderId: work });
    render(<App />);
    act(() => openDialog({ kind: 'settings' }));
    const field = await screen.findByLabelText('Default list');
    expect(
      within(field)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Inbox', 'Work › Team']);
    await user.selectOptions(field, 'Work › Team');
    expect(useData.getState().settings.defaultListId).toBe(team);
    expect(homeView()).toEqual({ kind: 'list', listId: team });
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

describe('hiding the sidebar', () => {
  const hidden = () => useData.getState().settings.sidebarHidden;

  it('hides with its button and comes back with the main pane’s button', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(hidden()).toBe(true);
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'List name' })).toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show sidebar' });
    await waitFor(() => expect(show).toHaveFocus());

    await user.click(show);
    expect(hidden()).toBe(false);
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();
  });

  it('toggles with Ctrl+\\, even while typing, and isn’t part of undo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('textbox', { name: 'Add a task' }));
    const steps = useData.getState().past.length;
    await user.keyboard('{Control>}\\{/Control}');
    expect(hidden()).toBe(true);
    await user.keyboard('{Control>}\\{/Control}');
    expect(hidden()).toBe(false);
    expect(useData.getState().past).toHaveLength(steps);
  });

  it('is in the sidebar’s settings menu, and F6 skips the sidebar while it’s hidden', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Hide sidebar/ }));
    expect(hidden()).toBe(true);

    // Only the view is left to cycle through, so F6 stays in it.
    await user.click(screen.getByRole('textbox', { name: 'Add a task' }));
    await user.keyboard('{F6}');
    expect(document.activeElement?.closest('[data-region]')).toHaveAttribute('data-region', 'view');
  });
});

describe('hiding the sidebar: focus and sidebar actions', () => {
  it('leaves focus alone unless it was on what disappears', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByRole('textbox', { name: 'Add a task' });
    await user.click(field);
    await user.keyboard('Buy milk');
    await user.keyboard('{Control>}\\{/Control}');
    expect(useData.getState().settings.sidebarHidden).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(field).toHaveFocus();
    await user.keyboard('{Control>}\\{/Control}');
    await new Promise((r) => setTimeout(r, 20));
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Buy milk');

    // From inside the sidebar, focus goes to the button that brings it back.
    await user.click(sidebar().getByRole('button', { name: 'Inbox' }));
    await user.keyboard('{Control>}\\{/Control}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveFocus());
    // And from that button, to the sidebar.
    await user.keyboard('{Control>}\\{/Control}');
    await waitFor(() =>
      expect(document.activeElement?.closest('[data-region="sidebar"]')).not.toBeNull(),
    );
  });

  it('shows the sidebar first for New folder and Rename', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(useData.getState().settings.sidebarHidden).toBe(true);
    act(() => newFolder());
    expect(useData.getState().settings.sidebarHidden).toBe(false);
    expect(await screen.findByRole('textbox', { name: 'Folder name' })).toBeInTheDocument();

    act(() => useUI.setState({ renaming: null }));
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    const inbox = Object.values(useData.getState().tables.lists).find((l) => l.title === 'Inbox')!;
    act(() => useUI.setState({ renaming: { kind: 'list', id: inbox.id } }));
    expect(useData.getState().settings.sidebarHidden).toBe(false);

    act(() => useUI.setState({ renaming: null }));
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}');
    expect(useData.getState().settings.sidebarHidden).toBe(false);
  });
});
