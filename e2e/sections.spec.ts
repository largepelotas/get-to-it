import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row } from './helpers';

test('adds sections, files tasks in them, collapses, moves between them, deletes and undoes', async ({
  page,
}) => {
  await openApp(page);
  await openList(page, 'Inbox');

  // Two sections: one from the list's menu, one from the button under the tasks.
  await page.getByRole('button', { name: 'List actions' }).click();
  await page.getByRole('menuitem', { name: 'Add section' }).click();
  await expect(page.getByRole('textbox', { name: 'Section name' })).toBeFocused();
  await page.keyboard.type('Kitchen');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.keyboard.type('Garden');
  await page.keyboard.press('Enter');
  const kitchen = page.getByRole('heading', { name: /^Kitchen, \d+ tasks?$/ });
  const garden = page.getByRole('heading', { name: /^Garden, \d+ tasks?$/ });
  await expect(kitchen).toHaveAccessibleName('Kitchen, 0 tasks');

  // A task into Kitchen from its heading, and one into Garden with /section.
  await kitchen.hover();
  await kitchen.getByRole('button', { name: 'Add task' }).click();
  await page.keyboard.type('Buy tiles');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await addTasks(page, 'Plant bulbs /Garden');
  await expect(kitchen).toHaveAccessibleName('Kitchen, 1 task');
  await expect(garden).toHaveAccessibleName('Garden, 1 task');
  await expect(page.getByRole('list', { name: 'Garden tasks' }).getByRole('listitem')).toHaveCount(
    1,
  );

  // Collapse Kitchen.
  await kitchen.getByRole('button', { name: 'Collapse Kitchen' }).click();
  await expect(row(page, 'Buy tiles')).toBeHidden();
  await kitchen.getByRole('button', { name: 'Expand Kitchen' }).click();
  await expect(row(page, 'Buy tiles')).toBeVisible();

  // Move Buy tiles to Garden from its menu.
  await row(page, 'Buy tiles').click({ button: 'right', position: { x: 400, y: 10 } });
  await page.getByRole('menuitem', { name: 'Move to section' }).click();
  await page.getByRole('menuitem', { name: 'Garden' }).click();
  await expect(garden).toHaveAccessibleName('Garden, 2 tasks');
  await expect(page.getByRole('list', { name: 'Garden tasks' }).getByRole('listitem')).toHaveCount(
    2,
  );

  // Delete Garden: its tasks stay in the list, and Undo brings the heading back.
  await garden.hover();
  await garden.getByRole('button', { name: 'Section actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete section' }).click();
  await expect(page.getByRole('heading', { name: /^Garden/ })).toBeHidden();
  await expect(row(page, 'Plant bulbs')).toBeVisible();
  await expect(row(page, 'Buy tiles')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(garden).toHaveAccessibleName('Garden, 2 tasks');
});
