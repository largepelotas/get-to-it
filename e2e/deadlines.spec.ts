import { expect, test } from '@playwright/test';
import { addTasks, expectAccessible, openApp, row } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

// Bug it prevents: the range or the deadline was read by quick add but never reached the row's
// description, or the deadline could not be removed again from the details panel.
// "today" is spelled out (and "overdue" allowed, as 2 PM may have passed): a bare time that has already passed rolls to tomorrow.
test('quick add reads a deadline and a time range, and the deadline can be cleared', async ({
  page,
}) => {
  await addTasks(page, 'Send report {tomorrow} today 2-3:30pm');
  const task = row(page, 'Send report');
  await expect(task).toHaveAccessibleDescription(
    /^Due Today (2:00 PM|14:00) to (3:30 PM|15:30)(, overdue)?\. Deadline Tomorrow/,
  );

  await task.hover();
  await task.getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await expect(panel.getByRole('button', { name: 'Deadline Tomorrow, change' })).toBeVisible();
  await panel.getByRole('button', { name: 'Clear deadline' }).click();
  await expect(panel.getByRole('button', { name: 'Add deadline' })).toBeVisible();
  await expect(task).not.toHaveAccessibleDescription(/Deadline/);

  await expectAccessible(page);
});
