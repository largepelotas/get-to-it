import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton, taskRows } from './helpers';

test('finished tasks show under Today in Completed, and unticking puts one back', async ({
  page,
}) => {
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Write report', 'Send invoice');
  await row(page, 'Write report').getByRole('checkbox').click();
  await row(page, 'Send invoice').getByRole('checkbox').click();
  await expect(taskRows(page)).toHaveCount(0);

  await sidebarButton(page, 'Completed').click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Completed' })).toBeVisible();
  const today = main.getByRole('region', { name: /^Today/ });
  await expect(today.getByRole('listitem')).toHaveCount(2);
  await expect(today.getByRole('listitem', { name: 'Write report' })).toHaveAccessibleDescription(
    /^Completed .* In Inbox\.$/,
  );

  await today.getByRole('checkbox', { name: 'Write report' }).click();
  await expect(today.getByRole('listitem')).toHaveCount(1);
  await expect(today.getByRole('listitem', { name: 'Write report' })).toBeHidden();

  await openList(page, 'Inbox');
  await expect(taskRows(page)).toHaveCount(1);
  await expect(row(page, 'Write report')).toBeVisible();
});

test('Statistics counts what was finished today', async ({ page }) => {
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Write report');
  await row(page, 'Write report').getByRole('checkbox').click();

  await sidebarButton(page, 'Statistics').click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Statistics' })).toBeVisible();
  const figure = main
    .getByRole('group', { name: 'Tasks done' })
    .getByText('Today', { exact: true })
    .locator('..');
  await expect(figure).toContainText('1');
  await expect(main.getByRole('img', { name: /^1 task completed in the past year/ })).toBeVisible();
});
