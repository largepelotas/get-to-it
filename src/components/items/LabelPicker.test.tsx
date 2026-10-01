import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { createItem } from '@/store/actions/items';
import { createLabel, setItemLabels } from '@/store/actions/labels';
import { createList } from '@/store/actions/lists';
import { resetForTests, undo, useData } from '@/store/data';
import { useUI } from '@/store/ui';

// Pass B2 of labels: chips on rows, the picker, and the places that open it.

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    multiSelectedIds: [],
    detailsOpen: false,
    duePickerFor: null,
    labelPickerFor: null,
    selectionLabelsOpen: false,
  });
  list = createList({ type: 'todo', title: 'Work' });
  useUI.setState({ view: { kind: 'list', listId: list } });
});

type User = ReturnType<typeof userEvent.setup>;

const tables = () => useData.getState().tables;
const find = (text: string) => Object.values(tables().items).find((i) => i.text === text) as Item;
const labelIds = (text: string) =>
  find(text)
    .labelIds.map((id) => tables().labels[id].name)
    .sort();
const row = (text: string) => screen.getByRole('listitem', { name: text });
const picker = () => screen.getByRole('group', { name: 'Labels' });
const tick = (name: string) => within(picker()).getByRole('checkbox', { name });
const add = (text: string, ...labels: string[]) =>
  createItem(list, { text, labelIds: labels.map((n) => createLabel(n)!) })!;
const rightClick = (user: User, target: HTMLElement) =>
  user.pointer({ keys: '[MouseRight]', target });

describe('label chips on rows', () => {
  // Breaks if labelled tasks look the same as unlabelled ones in a list.
  it('shows a chip per label on the row, and none on an unlabelled task', () => {
    add('Call the bank', 'Errands', 'Phone');
    createItem(list, { text: 'Plain' });
    render(<App />);
    const chips = within(row('Call the bank')).getAllByRole('button', { name: /^Label / });
    expect(chips.map((c) => c.textContent)).toEqual(['Errands', 'Phone']);
    expect(within(row('Plain')).queryByRole('button', { name: /^Label / })).toBeNull();
  });

  // Breaks if a chip is a tab stop of its own, or clicking one does not open the label's view.
  it('opens the label view when a chip is clicked, and is not a tab stop', async () => {
    add('Call the bank', 'Errands');
    const user = userEvent.setup();
    render(<App />);
    const chip = within(row('Call the bank')).getByRole('button', { name: 'Label Errands, open' });
    expect(chip).toHaveAttribute('tabindex', '-1');
    await user.click(chip);
    expect(useUI.getState().view).toEqual({
      kind: 'label',
      labelId: Object.values(tables().labels)[0].id,
    });
  });

  // Breaks if Today leaves the chips off (they belong in every smart view).
  it('shows chips in Today too', () => {
    const id = createLabel('Errands')!;
    createItem(list, { text: 'Due now', labelIds: [id], dueDate: '2000-01-01' });
    useUI.setState({ view: { kind: 'today' } });
    render(<App />);
    expect(within(row('Due now')).getByRole('button', { name: /^Label Errands/ })).toBeVisible();
  });

  // Breaks if a dangling label id leaves an empty chip.
  it('ignores a label id that names no label', () => {
    const id = add('Odd');
    act(() => {
      useData.setState((s) => ({
        tables: {
          ...s.tables,
          items: { ...s.tables.items, [id]: { ...s.tables.items[id], labelIds: ['gone'] } },
        },
      }));
    });
    render(<App />);
    expect(within(row('Odd')).queryByRole('button', { name: /^Label / })).toBeNull();
  });
});

describe('label picker', () => {
  async function openFromDetails(user: User) {
    await user.click(within(row('Task')).getByRole('button', { name: 'Open details' }));
    await user.click(await screen.findByRole('button', { name: 'Add label' }));
  }

  // Breaks if the details panel has no way to add a label, or the picker closes after one toggle.
  it('toggles labels from the details panel and stays open', async () => {
    add('Task', 'Errands');
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    expect(tick('Errands')).toHaveAttribute('aria-checked', 'true');
    expect(tick('Phone')).toHaveAttribute('aria-checked', 'false');
    await user.click(tick('Phone'));
    await user.click(tick('Errands'));
    expect(labelIds('Task')).toEqual(['Phone']);
    expect(picker()).toBeVisible();
  });

  // Breaks if typing does not narrow the list, or an existing name is offered for creation again.
  it('filters, and offers Create only when no label matches exactly', async () => {
    add('Task', 'Errands');
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    await user.keyboard('err');
    expect(
      within(picker())
        .getAllByRole('checkbox')
        .map((c) => c.textContent),
    ).toEqual(['Errands']);
    expect(within(picker()).getByRole('button', { name: 'Create "err"' })).toBeVisible();
    await user.keyboard('ands');
    expect(within(picker()).queryByRole('button', { name: /^Create/ })).toBeNull();
  });

  // Breaks if Create makes the label without putting it on the task, or takes two undo steps.
  it('creates a label and puts it on the task in one undo step', async () => {
    add('Task', 'Errands');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    await user.keyboard('Garden');
    await user.click(within(picker()).getByRole('button', { name: 'Create "Garden"' }));
    expect(labelIds('Task')).toEqual(['Errands', 'Garden']);
    undo();
    expect(labelIds('Task')).toEqual(['Errands']);
    expect(Object.values(tables().labels).map((l) => l.name)).toEqual(['Errands']);
  });

  // Breaks if the keyboard cannot reach the list or toggle with Enter.
  it('moves with the arrow keys and toggles with Enter, or Enter in the field', async () => {
    add('Task');
    createLabel('Errands');
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(tick('Phone')).toHaveFocus();
    expect(labelIds('Task')).toEqual(['Phone']);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('textbox', { name: 'Filter or create a label' })).toHaveFocus();
    await user.keyboard('err{Enter}');
    expect(labelIds('Task')).toEqual(['Errands', 'Phone']);
  });

  // Breaks if Enter takes the first label containing the text over the one named exactly.
  it('prefers the exactly named label on Enter', async () => {
    add('Task');
    createLabel('homework');
    createLabel('work');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    await user.keyboard('work{Enter}');
    expect(labelIds('Task')).toEqual(['work']);
  });

  // Breaks if Escape leaves the picker up.
  it('closes with Escape', async () => {
    add('Task');
    createLabel('Errands');
    const user = userEvent.setup();
    render(<App />);
    await openFromDetails(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Labels' })).toBeNull();
  });

  // Breaks if the remove (x) button on a chip in the details panel does nothing.
  it('removes a label with its x button in the details panel', async () => {
    add('Task', 'Errands', 'Phone');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Task')).getByRole('button', { name: 'Open details' }));
    await user.click(await screen.findByRole('button', { name: 'Remove label Errands' }));
    expect(labelIds('Task')).toEqual(['Phone']);
  });
});

describe('opening the picker', () => {
  // Breaks if the task menu has no Labels submenu, or choosing a label does not toggle it.
  it('toggles a label from the task menu', async () => {
    add('Task', 'Errands');
    createLabel('Phone');
    const user = userEvent.setup();
    render(<App />);
    await rightClick(user, row('Task'));
    await user.click(await screen.findByRole('menuitem', { name: 'Labels' }));
    await user.keyboard('{ArrowRight}');
    const phone = await screen.findByRole('menuitem', { name: 'Phone' });
    act(() => phone.focus());
    await user.keyboard('{Enter}');
    expect(labelIds('Task')).toEqual(['Errands', 'Phone']);
  });

  // Breaks if "New label..." in the menu does not open the picker on the task.
  it('opens the picker from "New label…" in the task menu', async () => {
    add('Task');
    const user = userEvent.setup();
    render(<App />);
    await rightClick(user, row('Task'));
    await user.click(await screen.findByRole('menuitem', { name: 'Labels' }));
    await user.keyboard('{ArrowRight}');
    const entry = await screen.findByRole('menuitem', { name: 'New label…' });
    act(() => entry.focus());
    await user.keyboard('{Enter}');
    expect(useUI.getState().labelPickerFor).toBe(find('Task').id);
    expect(await screen.findByRole('textbox', { name: 'Filter or create a label' })).toBeVisible();
  });

  // Breaks if L does nothing on a focused task.
  it('opens the picker for the focused task with L', async () => {
    add('Task');
    createLabel('Errands');
    const user = userEvent.setup();
    render(<App />);
    act(() => row('Task').focus());
    await user.keyboard('l');
    expect(useUI.getState().labelPickerFor).toBe(find('Task').id);
    expect(await screen.findByRole('group', { name: 'Labels' })).toBeVisible();
  });

  // Breaks if the selection bar cannot label several tasks, or the mixed state is wrong.
  it('labels the whole selection from the bar with a mixed state', async () => {
    const a = add('One', 'Errands');
    const b = createItem(list, { text: 'Two' })!;
    const phone = createLabel('Phone')!;
    setItemLabels(a, [...find('One').labelIds, phone]);
    const user = userEvent.setup();
    render(<App />);
    act(() => useUI.setState({ multiSelectedIds: [a, b], selectedItemId: a }));
    await user.click(await screen.findByRole('button', { name: 'Labels' }));
    expect(tick('Errands')).toHaveAttribute('aria-checked', 'mixed');
    await user.click(tick('Errands'));
    expect(tick('Errands')).toHaveAttribute('aria-checked', 'true');
    expect(labelIds('Two')).toEqual(['Errands']);
    undo();
    expect(labelIds('Two')).toEqual([]);
    expect(labelIds('One')).toEqual(['Errands', 'Phone']);
    await user.click(tick('Errands'));
    await user.click(tick('Errands'));
    expect(labelIds('One')).toEqual(['Phone']);
  });

  // Breaks if L with several selected labels only the focused one.
  it('opens the picker for the whole selection with L', async () => {
    const a = add('One');
    const b = add('Two');
    const user = userEvent.setup();
    render(<App />);
    act(() => useUI.setState({ multiSelectedIds: [a, b], selectedItemId: a }));
    act(() => row('One').focus());
    await user.keyboard('l');
    expect(useUI.getState().selectionLabelsOpen).toBe(true);
    expect(await screen.findByRole('group', { name: 'Labels' })).toBeVisible();
  });
});
