import { expect, test } from '@playwright/test';
import {
  addTasks,
  expectAccessible,
  openApp,
  openList,
  row,
  sidebar,
  sidebarButton,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('creates a list in a folder from the New list dialog', async ({ page }) => {
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByRole('radio', { name: 'Grocery' }).check();
  await dialog.getByLabel('Name').fill('Weekend shop');
  await dialog.getByLabel('Folder').selectOption('Work');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Weekend shop' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Add an item' })).toBeFocused();
  await expect(sidebarButton(page, 'Weekend shop')).toBeVisible();
});

test('renames a folder from its actions button', async ({ page }) => {
  await sidebarButton(page, 'Work').hover();
  await sidebar(page).getByRole('button', { name: 'Work actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const field = sidebar(page).getByRole('textbox', { name: 'Folder name' });
  await expect(field).toBeFocused();
  await field.fill('Projects');
  await field.press('Enter');
  await expect(sidebarButton(page, 'Projects')).toBeVisible();
});

test('moves a list to the Trash, undoes, then restores it from the Trash', async ({ page }) => {
  await openList(page, 'Inbox');
  await addTasks(page, 'Keep me');
  await page.getByRole('button', { name: 'List actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(sidebarButton(page, 'Inbox')).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebarButton(page, 'Inbox')).toBeVisible();

  await openList(page, 'Inbox');
  await page.getByRole('button', { name: 'List actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await page.getByRole('button', { name: /^Trash/ }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await openList(page, 'Inbox');
  await expect(row(page, 'Keep me')).toBeVisible();
});

test('archives a list, which then opens read-only', async ({ page }) => {
  await openList(page, 'Inbox');
  await page.getByRole('button', { name: 'List actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await page.getByRole('button', { name: /^Archive/ }).click();
  await page.getByRole('button', { name: /Inbox/ }).first().click();
  await expect(page.getByText('This list is archived.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Add a task' })).toHaveCount(0);
});

test('hides and shows the sidebar, and remembers it after a reload', async ({ page }) => {
  const nav = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(nav).toBeVisible();

  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(nav).toBeHidden();
  const show = page.getByRole('button', { name: 'Show sidebar' });
  await expect(show).toBeFocused();
  // Close the button's tooltip, which sits outside the page's landmarks.
  await page.keyboard.press('Escape');
  await expectAccessible(page);

  await page.reload();
  await expect(show).toBeVisible();
  await expect(nav).toBeHidden();

  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(nav).toBeVisible();
  await expect(show).toBeHidden();
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(nav).toBeHidden();
  await show.click();
  await expect(nav).toBeVisible();
});

test('the Show sidebar button clears the view header', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  const button = await page.getByRole('button', { name: 'Show sidebar' }).boundingBox();
  const title = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(title!.y);
});
