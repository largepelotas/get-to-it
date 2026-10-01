import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, taskRows } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('quick-add reads dates and priority, and shows what it read', async ({ page }) => {
  const field = page.getByRole('textbox', { name: 'Add a task' });
  await field.fill('Review deck tomorrow 3pm p1');
  await expect(page.getByText('Tomorrow 15:00', { exact: true })).toBeVisible();
  await expect(page.getByText('P1', { exact: true })).toBeVisible();
  await field.press('Enter');

  const task = row(page, 'Review deck');
  await expect(task).toBeVisible();
  await expect(task).toHaveAccessibleDescription('Due Tomorrow 15:00. Priority 1');
});

test('builds subtasks from the keyboard and completes a parent with them', async ({ page }) => {
  await addTasks(page, 'Plan offsite');
  await row(page, 'Plan offsite').getByRole('textbox', { name: 'Task' }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Book venue');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Send invites');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await expect(taskRows(page)).toHaveCount(3);
  const parent = row(page, 'Plan offsite');
  await expect(parent).toHaveAccessibleDescription('0 of 2 subtasks done');

  await parent.getByRole('checkbox').click();
  await expect(taskRows(page)).toHaveCount(0);
  const done = page.getByRole('list', { name: 'Completed tasks' }).getByRole('listitem');
  await expect(done).toHaveCount(3);
  await page.getByRole('button', { name: /^Completed/ }).click();
  await expect(done).toHaveCount(0);
});

test('edits a task in the details panel and keeps it after a reload', async ({ page }) => {
  await addTasks(page, 'Write report');
  await row(page, 'Write report').hover();
  await row(page, 'Write report').getByRole('button', { name: 'Open details' }).click();

  const panel = page.getByRole('complementary', { name: 'Task details' });
  await panel.getByRole('button', { name: 'Priority 2' }).click();
  const notes = panel.getByRole('textbox', { name: 'Notes' });
  await notes.click();
  await page.keyboard.type('Numbers from finance');
  await expect(row(page, 'Write report')).toHaveAccessibleDescription('Priority 2. Has notes');

  // Saves are debounced; give them a moment before reloading.
  await page.waitForTimeout(400);
  await page.reload();
  await openList(page, 'Inbox');
  await expect(row(page, 'Write report')).toHaveAccessibleDescription('Priority 2. Has notes');
});

test('deletes a task and brings it back from the toast', async ({ page }) => {
  await addTasks(page, 'Temporary');
  await row(page, 'Temporary').click({ position: { x: 400, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(taskRows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Temporary')).toBeVisible();
});

test('a repeating task moves to its next date when checked', async ({ page }) => {
  await addTasks(page, 'Water plants every day');
  const task = row(page, 'Water plants');
  await expect(task).toHaveAccessibleDescription(/^Due Today\. Repeats every day/);
  await task.getByRole('checkbox').click();
  await expect(task).toHaveAccessibleDescription(/^Due Tomorrow\. Repeats every day/);
});

test('clicking the due date on a row opens the date picker', async ({ page }) => {
  await addTasks(page, 'Review deck tomorrow');
  const task = row(page, 'Review deck');
  await task.getByRole('button', { name: 'Due date: Tomorrow, change' }).click();

  const panel = page.getByRole('complementary', { name: 'Task details' });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('Time')).toBeVisible();
  // The click didn't tick the task or start editing it.
  await expect(task.getByRole('checkbox')).not.toBeChecked();
  await expect(task.getByRole('textbox', { name: 'Task' })).not.toBeFocused();
});
