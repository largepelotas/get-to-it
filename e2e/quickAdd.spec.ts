import { expect, test } from '@playwright/test';
import { openApp, openList, row, sidebar } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('adds a task to another list from the quick-add dialog, and undoes it', async ({ page }) => {
  // Open a different to-do list, so the dialog starts there and the picker has to change it.
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const newList = page.getByRole('dialog', { name: 'New list' });
  await newList.getByLabel('Name').fill('Errands');
  await newList.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('textbox', { name: 'List name' })).toHaveValue('Errands');

  // Mod+Shift+A opens the dialog from any screen.
  await page.keyboard.press('ControlOrMeta+Shift+a');
  const dialog = page.getByRole('dialog', { name: 'Add a task' });
  const field = dialog.getByRole('textbox', { name: 'Add a task' });
  await expect(field).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'List' })).toHaveValue(/.+/);
  await dialog.getByRole('combobox', { name: 'List' }).selectOption({ label: 'Inbox' });

  await field.fill('Call Sam p1');
  await field.press('Enter');

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Added to Inbox')).toBeVisible();
  // Still in Errands, so the task is not here.
  await expect(row(page, 'Call Sam')).toBeHidden();
  await openList(page, 'Inbox');
  await expect(row(page, 'Call Sam')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Call Sam')).toBeHidden();
});
