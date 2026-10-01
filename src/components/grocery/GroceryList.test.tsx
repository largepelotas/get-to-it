import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { createGroceryItem } from '@/store/actions/grocery';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { groceryModel } from '@/store/grocery';
import { openDialog, openList, useUI } from '@/store/ui';

let list: string;

// Dialogs load lazily; loaded up front they open without suspending.
beforeAll(() => preloadDialogs());

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({ view: { kind: 'today' }, dialog: null, renaming: null, selectedItemId: null });
  list = createList({ type: 'grocery', title: 'Shop' });
  openList(list);
});

const add = (text: string) => createGroceryItem(list, text)!;
const model = () =>
  groceryModel(
    useData.getState().tables.items,
    list,
    useData.getState().settings.groceryCategories,
  );
const groups = () =>
  model().groups.map((g) => `${g.category.name}: ${g.items.map((i) => i.text).join(', ')}`);
const cart = () => model().cart.map((i) => i.text);
const row = (text: string) => screen.getByRole('listitem', { name: text });
/** The Undo button of the toast saying `message` (toasts from earlier tests may linger). */
const undoButton = async (message: string) =>
  within((await screen.findByText(message)).closest<HTMLElement>('[data-sonner-toast]')!).getByRole(
    'button',
    { name: 'Undo' },
  );

describe('GroceryList', () => {
  it('adds items with a quantity into their category', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByRole('textbox', { name: 'Add an item' });
    await user.type(field, '2 lemons');
    expect(screen.getByText('Qty 2')).toBeInTheDocument();
    expect(screen.getByText('Produce')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await user.type(field, 'milk 1 l{Enter}birthday card{Enter}');
    expect(field).toHaveValue('');
    expect(groups()).toEqual(['Produce: lemons', 'Dairy & eggs: milk', 'Other: birthday card']);

    const dairy = within(screen.getByRole('list', { name: 'Dairy & eggs' }));
    expect(dairy.getByRole('textbox', { name: 'Quantity' })).toHaveValue('1 l');
  });

  it('checks items into the cart, then clears it with Undo', async () => {
    add('Milk');
    add('Bread');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Milk')).getByRole('checkbox', { name: 'Milk' }));
    expect(cart()).toEqual(['Milk']);
    const inCart = within(screen.getByRole('list', { name: 'In cart' }));
    expect(inCart.getByRole('checkbox', { name: 'Milk' })).toBeChecked();
    expect(inCart.getByText('Dairy & eggs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear checked' }));
    expect(cart()).toEqual([]);
    expect(screen.queryByRole('list', { name: 'In cart' })).not.toBeInTheDocument();
    await user.click(await undoButton('Cleared 1 item from the cart'));
    expect(cart()).toEqual(['Milk']);
  });

  it('puts everything back on the list with Uncheck all', async () => {
    add('Milk');
    add('Bread');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Milk')).getByRole('checkbox'));
    await user.click(within(row('Bread')).getByRole('checkbox'));
    expect(screen.getByText('Everything’s in the cart.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Uncheck all' }));
    expect(cart()).toEqual([]);
    expect(groups()).toEqual(['Bakery: Bread', 'Dairy & eggs: Milk']);
  });

  it('handles the keyboard: toggle, move, edit the quantity and delete', async () => {
    add('Milk');
    add('Butter');
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('Butter'));
    expect(row('Butter')).toHaveFocus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(groups()).toEqual(['Dairy & eggs: Butter, Milk']);

    await user.keyboard('{Enter}');
    expect(within(row('Butter')).getByRole('textbox', { name: 'Item' })).toHaveFocus();
    await user.keyboard('{Tab}250 g{Enter}');
    expect(row('Butter')).toHaveFocus();
    expect(model().open[0].quantity).toBe('250 g');

    await user.keyboard(' ');
    expect(cart()).toEqual(['Butter']);
    expect(row('Milk')).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(groups()).toEqual([]);
    await user.click(await undoButton('Deleted “Milk”'));
    expect(groups()).toEqual(['Dairy & eggs: Milk']);
  });

  it('files an item under another category from its menu', async () => {
    add('Birthday card');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Birthday card')).getByRole('button', { name: 'Category' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Household' }));
    expect(groups()).toEqual(['Household: Birthday card']);
  });

  it('is read-only in an archived list', () => {
    add('Milk');
    act(() =>
      useData.setState((s) => ({
        tables: {
          ...s.tables,
          lists: { ...s.tables.lists, [list]: { ...s.tables.lists[list], archivedAt: 1 } },
        },
      })),
    );
    render(<App />);
    expect(screen.queryByRole('textbox', { name: 'Add an item' })).not.toBeInTheDocument();
    expect(within(row('Milk')).getByRole('textbox', { name: 'Item' })).toHaveAttribute('readonly');
    expect(within(row('Milk')).getByRole('checkbox')).toBeDisabled();
  });
});

describe('Grocery categories in Settings', () => {
  it('renames, reorders, adds and removes categories', async () => {
    add('Milk');
    const user = userEvent.setup();
    render(<App />);
    act(() => openDialog({ kind: 'settings' }));
    const editor = within(await screen.findByRole('list', { name: 'Grocery categories' }));
    const names = () => useData.getState().settings.groceryCategories.map((c) => c.name);

    const dairy = editor.getAllByRole('textbox', { name: 'Category name' })[3];
    await user.clear(dairy);
    await user.type(dairy, 'Fridge');
    expect(names()[3]).toBe('Fridge');
    await user.click(editor.getByRole('button', { name: 'Move Fridge up' }));
    expect(names().slice(2, 4)).toEqual(['Fridge', 'Meat & seafood']);

    await user.click(screen.getByRole('button', { name: 'Add category' }));
    expect(names().at(-1)).toBe('New category');
    expect(editor.getAllByRole('textbox', { name: 'Category name' }).at(-1)).toHaveFocus();
    await user.keyboard('Baby');
    expect(names().at(-1)).toBe('Baby');

    await user.click(editor.getByRole('button', { name: 'Remove Fridge' }));
    expect(names()).not.toContain('Fridge');
    expect(groups()).toEqual(['Other: Milk']);

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(groups()).toEqual(['Dairy & eggs: Milk']);
  });
});
