import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

test('adds a task with @errands, adds a second label from the details, opens the view, renames, deletes and undoes', async ({
  page,
}) => {
  await openApp(page);
  await openList(page, 'Inbox');

  // @errands makes the label, puts it on the task and lists it in the sidebar.
  await addTasks(page, 'Call the bank @errands');
  await expect(row(page, 'Call the bank')).toBeVisible();
  await expect(
    row(page, 'Call the bank').getByRole('button', { name: 'Label errands, open' }),
  ).toBeVisible();
  await expect(sidebarButton(page, 'errands')).toBeVisible();

  // A second label from the details panel's picker.
  await row(page, 'Call the bank').hover();
  await row(page, 'Call the bank').getByRole('button', { name: 'Open details' }).click();
  const details = page.getByRole('complementary', { name: 'Task details' });
  await details.getByRole('button', { name: 'Add label' }).click();
  await page.getByRole('textbox', { name: 'Filter or create a label' }).fill('Phone');
  await page.getByRole('button', { name: 'Create "Phone"' }).click();
  await expect(details.getByRole('button', { name: 'Remove label Phone' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Labels' })).toBeHidden();
  await expect(sidebarButton(page, 'Phone')).toBeVisible();

  // The label's view, from the sidebar, with a task added there.
  await sidebarButton(page, 'errands').click();
  await expect(page.getByRole('heading', { level: 1, name: 'errands' })).toBeVisible();
  await expect(row(page, 'Call the bank')).toBeVisible();
  await addTasks(page, 'Pay the rent');
  await expect(row(page, 'Pay the rent')).toBeVisible();
  await expect(
    row(page, 'Pay the rent').getByRole('button', { name: 'Label errands, open' }),
  ).toBeVisible();

  // Rename it in place.
  await sidebarButton(page, 'errands').dblclick();
  await page.getByRole('textbox', { name: 'Label name' }).fill('Chores');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Chores' })).toBeVisible();

  // Delete it: the view closes, the tasks stay, Undo brings the label back.
  await sidebarButton(page, 'Chores').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete label' }).click();
  await expect(sidebarButton(page, 'Chores')).toBeHidden();
  await openList(page, 'Inbox');
  await expect(row(page, 'Call the bank')).toBeVisible();
  await expect(
    row(page, 'Call the bank').getByRole('button', { name: /^Label Chores/ }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebarButton(page, 'Chores')).toBeVisible();
  await expect(
    row(page, 'Call the bank').getByRole('button', { name: 'Label Chores, open' }),
  ).toBeVisible();
});
