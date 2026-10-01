import { expect, test, type Page } from '@playwright/test';
import { addTasks, expectAccessible, openApp, openList, row, sidebar, taskRows } from './helpers';

const click = (page: Page, name: string, modifiers?: ('Shift' | 'ControlOrMeta')[]) =>
  row(page, name).click({ position: { x: 400, y: 10 }, modifiers });

test.beforeEach(async ({ page }) => {
  await openApp(page);
  // A second to-do list to move tasks to.
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const newList = page.getByRole('dialog', { name: 'New list' });
  await newList.getByLabel('Name').fill('Errands');
  await newList.getByRole('button', { name: 'Create' }).click();
  await openList(page, 'Inbox');
  await addTasks(page, 'First task', 'Second task', 'Third task', 'Fourth task');
});

test('selects three tasks, sets a priority, moves them to another list and undoes it', async ({
  page,
}) => {
  await click(page, 'First task');
  await click(page, 'Third task', ['Shift']);
  const bar = page.getByRole('toolbar', { name: 'Selected tasks' });
  await expect(bar).toContainText('3 selected');
  await expectAccessible(page);

  await bar.getByRole('button', { name: 'Priority' }).click();
  await page.getByRole('menuitem', { name: 'P1' }).click();
  for (const name of ['First task', 'Second task', 'Third task']) {
    await expect(row(page, name)).toHaveAccessibleDescription(/Priority 1$/);
  }
  await expect(row(page, 'Fourth task')).not.toHaveAccessibleDescription(/Priority 1$/);

  await bar.getByRole('button', { name: 'Move to' }).click();
  const picker = page.getByRole('dialog', { name: 'Move 3 tasks to…' });
  await expect(picker.getByRole('option', { name: /Inbox/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // The dialog fades in over the toast; scanned mid-fade, the toast's button reads as low contrast.
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
  await expectAccessible(page);
  await picker.getByRole('combobox').fill('erran');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Moved 3 tasks to Errands')).toBeVisible();
  await expect(taskRows(page)).toHaveCount(1);
  await expect(row(page, 'Fourth task')).toBeFocused();

  // The priority change has a toast of its own; undo the move.
  await page
    .locator('[data-sonner-toast]', { hasText: 'Moved 3 tasks' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(taskRows(page)).toHaveCount(4);
});

test('one-key shortcuts work on a focused task and on a selection', async ({ page }) => {
  await click(page, 'Second task');
  await page.keyboard.press('2');
  await expect(row(page, 'Second task')).toHaveAccessibleDescription(/Priority 2$/);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toContainText('4 selected');
  await page.keyboard.press('3');
  await expect(row(page, 'First task')).toHaveAccessibleDescription(/Priority 3$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toBeHidden();
  await expect(row(page, 'Second task')).toBeFocused();
});
