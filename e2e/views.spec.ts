import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

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

test('Tomorrow takes new tasks, and can be hidden from the sidebar in Settings', async ({
  page,
}) => {
  await openApp(page);
  await sidebarButton(page, 'Tomorrow').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tomorrow' })).toBeVisible();
  await addTasks(page, 'Book flights');
  await expect(row(page, 'Book flights')).toBeVisible();
  await expect(sidebarButton(page, 'Tomorrow')).toContainText('1');

  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('checkbox', { name: 'Show Tomorrow' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(sidebarButton(page, 'Tomorrow')).toHaveCount(0);
  // Still open, since it was the current view.
  await expect(page.getByRole('heading', { level: 1, name: 'Tomorrow' })).toBeVisible();
});

test('Next 7 days shows every day of the week, with a note on the empty ones', async ({ page }) => {
  await openApp(page);
  await sidebarButton(page, 'Next 7 days').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Next 7 days' })).toBeVisible();
  await expect(page.getByText('Nothing due')).toHaveCount(7);
  await addTasks(page, 'Pay invoice');
  await expect(page.getByText('Nothing due')).toHaveCount(6);
  await expect(row(page, 'Pay invoice')).toBeVisible();
});
