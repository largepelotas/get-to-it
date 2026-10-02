import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

// A Wednesday, so tomorrow is in the same week whatever day the suite runs on.
const NOW = new Date(2026, 9, 7, 12);

test('the week strip has seven days and moves by week', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await sidebarButton(page, 'Upcoming').click();
  const week = page.getByRole('group', { name: 'Week' });
  await expect(week.getByRole('button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
  await expect(week.getByRole('button', { name: /^Wednesday, October 7/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(week.getByRole('button').first()).toHaveAccessibleName(/^Monday, October 12/);
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeEnabled();

  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(week.getByRole('button', { name: /^Wednesday, October 7/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeDisabled();
});

test('dragging a task onto another day in the strip reschedules it', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Call Sam today');
  await sidebarButton(page, 'Upcoming').click();

  const task = page
    .getByRole('region', { name: /^Today · / })
    .getByRole('listitem', { name: 'Call Sam' });
  await task.hover();
  const grip = task.getByRole('button', { name: 'Drag to move' });
  const from = (await grip.boundingBox())!;
  const target = (await page
    .getByRole('group', { name: 'Week' })
    .getByRole('button', { name: /^Thursday, October 8/ })
    .boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2, {
    steps: 3,
  });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(row(page, 'Call Sam')).toHaveAccessibleDescription(/^Due Tomorrow/);
  await expect(
    page.getByRole('region', { name: /^Tomorrow · / }).getByRole('listitem', { name: 'Call Sam' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});
