import { expect, test } from '@playwright/test';
import { addTasks, expectAccessible, openApp, openList, row } from './helpers';

const NOW = new Date(2026, 9, 7, 12);

test('a list shown as a board puts cards in priority columns, and dragging one changes its priority', async ({
  page,
}) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Write brief p1', 'Call Sam');

  await page.getByRole('button', { name: 'View options' }).click();
  const options = page.getByRole('dialog', { name: 'View options' });
  await options
    .getByRole('radiogroup', { name: 'Layout' })
    .getByRole('radio', { name: 'Board' })
    .click();
  await options
    .getByRole('radiogroup', { name: 'Group by' })
    .getByRole('radio', { name: 'Priority' })
    .click();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  // Focus returned to the trigger shows its tooltip, which sits outside the landmarks.
  // Wait for that focus first, or it can land after the move below and undo it.
  await expect(page.getByRole('button', { name: 'View options' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Add a task' }).focus();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
  // Fades finish before axe reads the page.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

  const column = (name: string) => page.getByRole('region', { name });
  await expect(column('Priority 1').getByRole('listitem', { name: 'Write brief' })).toBeVisible();
  await expect(column('No priority').getByRole('listitem', { name: 'Call Sam' })).toBeVisible();
  await expect(column('Priority 2')).toBeVisible();
  await expect(column('Priority 3')).toBeVisible();
  await expectAccessible(page);

  const task = row(page, 'Call Sam');
  await task.hover();
  const grip = task.getByRole('button', { name: 'Drag to move' });
  const from = (await grip.boundingBox())!;
  const target = (await column('Priority 2').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 15 });
  await page.mouse.move(target.x + target.width / 2 + 2, target.y + 62, { steps: 3 });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(row(page, 'Call Sam')).toHaveAccessibleDescription(/Priority 2/);
  await expect(column('Priority 2').getByRole('listitem', { name: 'Call Sam' })).toBeVisible();
});
