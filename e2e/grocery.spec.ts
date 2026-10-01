import { expect, test } from '@playwright/test';
import { openApp, openList, row } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await openList(page, 'Groceries');
});

test('files items by category with their quantity, and moves checked ones to the cart', async ({
  page,
}) => {
  const field = page.getByRole('textbox', { name: 'Add an item' });
  for (const text of ['2 lemons', 'milk 1 l', 'frozen peas']) {
    await field.fill(text);
    await field.press('Enter');
  }

  await expect(page.getByRole('list', { name: 'Produce' }).getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'lemons')).toHaveAccessibleDescription('Quantity 2');
  await expect(row(page, 'milk')).toHaveAccessibleDescription('Quantity 1 l');
  await expect(page.getByRole('list', { name: 'Frozen' }).getByRole('listitem')).toHaveCount(1);

  await row(page, 'lemons').getByRole('checkbox').click();
  const cart = page.getByRole('list', { name: 'In cart' });
  await expect(cart.getByRole('listitem')).toHaveCount(1);
  await expect(row(page, 'lemons')).toHaveAccessibleDescription('Quantity 2. In cart. Produce');

  await page.getByRole('button', { name: 'Uncheck all' }).click();
  await expect(cart).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Produce' }).getByRole('listitem')).toHaveCount(1);
});

test('puts an item in the cart from the keyboard', async ({ page }) => {
  const field = page.getByRole('textbox', { name: 'Add an item' });
  await field.fill('bread');
  await field.press('Enter');
  await field.press('ArrowDown');
  await expect(row(page, 'bread')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('list', { name: 'In cart' }).getByRole('listitem')).toHaveCount(1);
});
