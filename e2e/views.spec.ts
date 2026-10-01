import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row } from './helpers';

test('Today and Upcoming gather dated tasks from every list', async ({ page }) => {
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Call Sam today', 'Dentist tomorrow 9am', 'Someday maybe');

  await page.getByRole('button', { name: /^Today/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(row(page, 'Call Sam')).toHaveAccessibleDescription('Due Today. In Inbox');
  await expect(row(page, 'Dentist')).toHaveCount(0);

  await page.getByRole('button', { name: /^Upcoming/ }).click();
  await expect(row(page, 'Dentist')).toBeVisible();
  await expect(row(page, 'Call Sam')).toHaveCount(0);
  await expect(row(page, 'Someday maybe')).toHaveCount(0);
});

test('a task added in Today is due today and goes to the Inbox', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+1');
  await addTasks(page, 'Pay invoice');
  await expect(row(page, 'Pay invoice')).toHaveAccessibleDescription('Due Today. In Inbox');
  await row(page, 'Pay invoice').getByRole('checkbox').click();
  await expect(row(page, 'Pay invoice')).toHaveCount(0);
});
