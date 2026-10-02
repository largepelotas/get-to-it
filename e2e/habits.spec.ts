import { expect, test } from '@playwright/test';
import { createList, openApp, openList, row, sidebarButton } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await createList(page, 'Habits', 'Routine');
});

test('checks a habit in, keeps it after a reload, and shows its details', async ({ page }) => {
  const field = page.getByRole('textbox', { name: 'Add a habit' });
  await expect(field).toBeFocused();
  for (const text of ['Read', 'Stretch']) {
    await field.fill(text);
    await field.press('Enter');
    await expect(field).toHaveValue('');
  }
  await expect(page.getByText('0 of 2 done today')).toBeVisible();

  await row(page, 'Read').getByRole('checkbox', { name: 'Read' }).click();
  await expect(page.getByText('1 of 2 done today')).toBeVisible();
  await expect(row(page, 'Read').getByText('1 day streak', { exact: true })).toBeVisible();
  await expect(row(page, 'Read')).toHaveAccessibleDescription(
    'Every day. 1 day streak. Done today.',
  );

  // Saves are debounced.
  await page.waitForTimeout(400);
  await page.reload();
  await openList(page, 'Routine');
  await expect(page.getByText('1 of 2 done today')).toBeVisible();
  await expect(row(page, 'Read').getByText('1 day streak', { exact: true })).toBeVisible();

  await row(page, 'Read').click();
  const details = page.getByRole('complementary', { name: 'Habit details' });
  await expect(details).toBeVisible();
  await expect(details.getByRole('img', { name: '1 check-in in the past year' })).toBeVisible();
});

test('keeps habits out of Today', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Add a habit' }).fill('Read');
  await page.keyboard.press('Enter');
  await row(page, 'Read').getByRole('checkbox', { name: 'Read' }).click();
  await sidebarButton(page, 'Today').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText('Read', { exact: true })).toHaveCount(0);
  await openList(page, 'Routine');
  await expect(row(page, 'Read')).toBeVisible();
});
