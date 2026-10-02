import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

// A Wednesday, so tomorrow is in the same week whatever day the suite runs on.
const NOW = new Date(2026, 9, 7, 12);

test('shows a task on its day with its time, and moves by month', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Dentist tomorrow 9am');
  await sidebarButton(page, 'Calendar').click();

  const main = page.getByRole('main');
  await expect(main.getByText('October 2026')).toBeVisible();
  const chip = page
    .getByRole('region', { name: 'Thursday, October 8, 1 task' })
    .getByRole('button', { name: 'Dentist' });
  await expect(chip.locator('span').first()).toHaveText(/^9:00/);
  await expect(chip).toHaveAccessibleDescription(/^Due Tomorrow/);

  await main.getByRole('button', { name: 'Next' }).click();
  await expect(main.getByText('November 2026')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dentist' })).toBeHidden();
  await main.getByRole('button', { name: 'Previous' }).click();
  await expect(main.getByText('October 2026')).toBeVisible();
});

test('dragging a task from the Tasks panel onto a day gives it that date', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Floss');
  await sidebarButton(page, 'Calendar').click();
  await page.getByRole('button', { name: 'Tasks' }).click();

  const task = page
    .getByRole('complementary', { name: 'Unscheduled tasks' })
    .getByRole('listitem', { name: 'Floss' });
  await task.hover();
  const grip = task.getByRole('button', { name: 'Drag to move' });
  const from = (await grip.boundingBox())!;
  const cell = page.getByRole('region', { name: 'Wednesday, October 7' });
  const target = (await cell.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 30, from.y - 20, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2, {
    steps: 3,
  });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(page.getByText('Moved to Today')).toBeVisible();
  const chip = page
    .getByRole('region', { name: 'Wednesday, October 7, 1 task' })
    .getByRole('button', { name: 'Floss' });
  await expect(chip).toHaveAccessibleDescription(/^Due Today/);
  await expect(task).toBeHidden();

  await sidebarButton(page, 'Today').click();
  await expect(row(page, 'Floss')).toBeVisible();
});
