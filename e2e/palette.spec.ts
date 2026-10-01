import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('finds a task in another list and opens it with its details', async ({ page }) => {
  await openList(page, 'Inbox');
  await addTasks(page, 'Renew passport');
  await openList(page, 'Groceries');

  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByRole('combobox').fill('passp');
  await expect(palette.getByRole('option').first()).toContainText('Renew passport');
  await page.keyboard.press('Enter');

  await expect(palette).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'List name' })).toHaveValue('Inbox');
  await expect(row(page, 'Renew passport')).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
});

test('runs commands, such as switching the theme', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox').fill('dark');
  await page.getByRole('option', { name: /Use dark theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
