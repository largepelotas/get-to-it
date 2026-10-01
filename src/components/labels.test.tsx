import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import type { Item, Label } from '@/data/types';
import { todayKey } from '@/lib/dates';
import { createItem, setChecked } from '@/store/actions/items';
import { createLabel, setItemLabels } from '@/store/actions/labels';
import { createList } from '@/store/actions/lists';
import { resetForTests, setSetting, undo, useData } from '@/store/data';
import { navigate, openDialog, useUI } from '@/store/ui';

// Pass B1 of labels: the sidebar area, the label view, the palette entries and
// `@label` in every to-do quick add.

beforeAll(() => preloadDialogs());

let work: string;
let home: string;

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
const labels = () => Object.values(useData.getState().tables.labels) as Label[];
const labelNamed = (name: string) => labels().find((l) => l.name === name) as Label;
const sidebar = () => within(screen.getByRole('complementary', { name: 'Sidebar' }));
const labelButton = (name: string) =>
  sidebar().getByRole('button', { name: new RegExp(String.raw`^(${name})\d*$`) });
// The "+" in the Labels heading (a row called "New label" has the same name).
const plus = () => sidebar().getAllByRole('button', { name: 'New label' })[0];
const row = (text: string) => screen.getByRole('listitem', { name: text });

/** A label with a task or two on it. */
function seedErrands() {
  const errands = createLabel('Errands')!;
  const bank = createItem(work, { text: 'Call the bank', labelIds: [errands] })!;
  createItem(home, { text: 'Buy stamps', labelIds: [errands] });
  createItem(home, { text: 'Unlabelled' });
  return { errands, bank };
}

describe('sidebar Labels area', () => {
  // Breaks if the area shows an empty heading (and a "+") when nothing is labelled.
  it('is hidden while there are no labels', () => {
    render(<App />);
    expect(sidebar().queryByText('Labels')).not.toBeInTheDocument();
    expect(sidebar().queryByRole('button', { name: 'New label' })).not.toBeInTheDocument();
  });

  // Breaks if counts include done tasks, or the open view isn't marked current.
  it('lists labels in order with the open-task count, and marks the open one', async () => {
    const { errands } = seedErrands();
    const phone = createLabel('Phone')!;
    createItem(home, { text: 'Done thing', labelIds: [phone] });
    setChecked(find('Done thing').id, true);
    const user = userEvent.setup();
    render(<App />);
    const rows = sidebar()
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /^(Errands|Phone)/.test(t ?? ''));
    expect(rows).toEqual(['Errands2', 'Phone']);

    await user.click(labelButton('Errands'));
    expect(useUI.getState().view).toEqual({ kind: 'label', labelId: errands });
    expect(labelButton('Errands')).toHaveAttribute('aria-current', 'page');
    expect(labelButton('Phone')).not.toHaveAttribute('aria-current');
  });

  // Breaks if "+" doesn't create a uniquely named label and open it for naming.
  it('adds "New label" from the plus button, numbering later ones, ready to rename', async () => {
    seedErrands();
    const user = userEvent.setup();
    render(<App />);
    await user.click(plus());
    expect(labelNamed('New label')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Label name' })).toHaveValue('New label');
    await user.keyboard('{Escape}');
    await user.click(plus());
    expect(labelNamed('New label 2')).toBeTruthy();
  });

  // Breaks if Escape saves, or a blank name wipes the label's name.
  it('renames in place: Enter saves, Escape cancels, blank keeps the old name', async () => {
    const { errands } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    const rename = async () => {
      await user.dblClick(labelButton('Errands|Chores'));
      return screen.getByRole('textbox', { name: 'Label name' });
    };
    let field = await rename();
    await user.clear(field);
    await user.type(field, 'Chores{Enter}');
    expect(useData.getState().tables.labels[errands].name).toBe('Chores');

    field = await rename();
    await user.clear(field);
    await user.type(field, 'Nope{Escape}');
    expect(useData.getState().tables.labels[errands].name).toBe('Chores');

    field = await rename();
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(useData.getState().tables.labels[errands].name).toBe('Chores');
    expect(screen.queryByRole('textbox', { name: 'Label name' })).not.toBeInTheDocument();
  });

  // Breaks if a clashing rename silently fails, or merges two labels.
  it('refuses a name another label has, keeping the old one and saying so', async () => {
    const { errands } = seedErrands();
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await user.dblClick(labelButton('Errands'));
    const field = screen.getByRole('textbox', { name: 'Label name' });
    await user.clear(field);
    await user.type(field, 'phone{Enter}');
    expect(useData.getState().tables.labels[errands].name).toBe('Errands');
    expect(await screen.findByText('There’s already a label called “phone”.')).toBeInTheDocument();
  });

  // Breaks if the menu entries aren't wired to the label actions.
  it('changes colour and moves a label from its menu', async () => {
    seedErrands();
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await user.click(sidebar().getByRole('button', { name: 'Phone actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Colour' }));
    // Keyboard: into the colour list ("None" is first), then down to Red.
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(labelNamed('Phone').color).toBe('red');

    await user.click(sidebar().getByRole('button', { name: 'Phone actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    expect(
      labels()
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
        .map((l) => l.name),
    ).toEqual(['Phone', 'Errands']);

    // The first label can't go higher.
    await user.click(sidebar().getByRole('button', { name: 'Phone actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  // Breaks if deleting leaves the user on a dead view, or Undo loses the tasks' labels.
  it('deletes a label with an Undo toast, and leaves its open view for home', async () => {
    const { errands, bank } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    await user.click(labelButton('Errands'));
    await user.click(sidebar().getByRole('button', { name: 'Errands actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete label' }));
    expect(labels()).toHaveLength(0);
    expect(find('Call the bank').labelIds).toEqual([]);
    expect(useUI.getState().view).toEqual({ kind: 'list', listId: home });
    expect(await screen.findByText('Deleted label Errands')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(useData.getState().tables.labels[errands]).toBeTruthy();
    expect(useData.getState().tables.items[bank].labelIds).toEqual([errands]);
  });

  // Breaks if the palette command makes a label no one can see (hidden sidebar).
  it('adds a label from the palette, showing a hidden sidebar first', async () => {
    setSetting('sidebarHidden', true);
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('new label');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(labelNamed('New label')).toBeTruthy());
    expect(useData.getState().settings.sidebarHidden).toBe(false);
    expect(await screen.findByRole('textbox', { name: 'Label name' })).toBeInTheDocument();
  });
});

describe('palette', () => {
  // Breaks if labels can't be reached from the keyboard.
  it('has a "Go to label" entry per label', async () => {
    const { errands } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('go to label err');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(useUI.getState().view).toEqual({ kind: 'label', labelId: errands }));
  });
});

describe('label view', () => {
  const open = (labelId: string) => act(() => navigate({ kind: 'label', labelId }));

  // Breaks if done tasks, other labels' tasks or the list name are missing.
  it('shows the open tasks that carry the label, with their list, and a count', () => {
    const { errands } = seedErrands();
    createItem(home, { text: 'Finished', labelIds: [errands] });
    setChecked(find('Finished').id, true);
    render(<App />);
    open(errands);
    expect(screen.getByRole('heading', { level: 1, name: 'Errands' })).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(within(row('Call the bank')).getByText('Work')).toBeInTheDocument();
    expect(row('Buy stamps')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Unlabelled' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Finished' })).not.toBeInTheDocument();
  });

  it('says so when no task has the label', () => {
    const empty = createLabel('Empty')!;
    render(<App />);
    open(empty);
    expect(screen.getByText('No tasks with this label.')).toBeInTheDocument();
  });

  // Breaks if a task added in the view doesn't carry its label (it would vanish at once) or gets a date.
  it('quick add files into the default list with the label and no due date', async () => {
    const { errands } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    open(errands);
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Post parcel{Enter}');
    expect(find('Post parcel')).toMatchObject({ listId: home, dueDate: null, labelIds: [errands] });
    expect(row('Post parcel')).toBeInTheDocument();
  });

  // Breaks if typed @labels or #List replace the view's label instead of adding to it.
  it('adds typed labels and #List on top of the view label', async () => {
    const { errands } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    open(errands);
    await user.type(
      screen.getByRole('textbox', { name: 'Add a task' }),
      'Order paper @office #Work{Enter}',
    );
    const task = find('Order paper');
    expect(task.listId).toBe(work);
    expect(task.labelIds).toEqual([errands, labelNamed('office').id]);
  });

  // Breaks if pasted lines lose the view's label.
  it('puts the label on every pasted line', async () => {
    const { errands } = seedErrands();
    const user = userEvent.setup();
    render(<App />);
    open(errands);
    await user.click(screen.getByRole('textbox', { name: 'Add a task' }));
    await user.paste('Milk\nEggs @shop');
    await user.click(screen.getByRole('button', { name: 'Add 2 tasks' }));
    expect(find('Milk').labelIds).toEqual([errands]);
    expect(find('Eggs').labelIds).toEqual([errands, labelNamed('shop').id]);
  });

  // Breaks if a task that lost the label stays in the view.
  it('drops a task from the view when it loses the label', () => {
    const { errands, bank } = seedErrands();
    render(<App />);
    open(errands);
    expect(row('Call the bank')).toBeInTheDocument();
    act(() => setItemLabels(bank, []));
    expect(screen.queryByRole('listitem', { name: 'Call the bank' })).not.toBeInTheDocument();
    expect(row('Buy stamps')).toBeInTheDocument();
  });

  // Breaks if the view is left open on a label that no longer exists.
  it('goes home when the label vanishes (undoing its creation)', async () => {
    const id = createLabel('Fleeting')!;
    render(<App />);
    open(id);
    expect(screen.getByRole('heading', { level: 1, name: 'Fleeting' })).toBeInTheDocument();
    act(() => void undo());
    await waitFor(() => expect(useUI.getState().view).toEqual({ kind: 'list', listId: home }));
  });
});

describe('quick add with @labels', () => {
  const field = () => screen.getByRole('textbox', { name: 'Add a task' });

  // Breaks if the field never hands the labels to the parser (no chips, @text left in the title).
  it('previews and applies an existing label and a new one in a list', async () => {
    createLabel('Errands');
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate({ kind: 'list', listId: work }));
    await user.type(field(), 'Pay rent @errands @urgent');
    expect(screen.getByText('@Errands')).toBeInTheDocument();
    expect(screen.getByText('@urgent (new)')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(find('Pay rent').labelIds).toEqual([labelNamed('Errands').id, labelNamed('urgent').id]);
  });

  it('works in a smart view, keeping its due date', async () => {
    const errands = createLabel('Errands')!;
    const user = userEvent.setup();
    render(<App />);
    await user.type(field(), 'Pay rent @errands{Enter}');
    expect(find('Pay rent')).toMatchObject({ dueDate: todayKey(), labelIds: [errands] });
  });

  it('works in the quick-add dialog', async () => {
    const errands = createLabel('Errands')!;
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'quickAdd' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Add a task' }),
      'Pay rent @errands',
    );
    expect(within(dialog).getByText('@Errands')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(find('Pay rent').labelIds).toEqual([errands]);
  });

  // Breaks if a label named on one pasted line spills onto the others, or is made twice.
  it('reads each pasted line on its own', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => navigate({ kind: 'list', listId: work }));
    await user.click(field());
    await user.paste('One @alpha\nTwo @beta @alpha\nThree');
    await user.click(screen.getByRole('button', { name: 'Add 3 tasks' }));
    const alpha = labelNamed('alpha').id;
    const beta = labelNamed('beta').id;
    expect(labels()).toHaveLength(2);
    expect(find('One').labelIds).toEqual([alpha]);
    expect(find('Two').labelIds).toEqual([beta, alpha]);
    expect(find('Three').labelIds).toEqual([]);
  });
});
