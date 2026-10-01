import { expect, test, type Page } from '@playwright/test';
import { addTasks, expectAccessible, openApp, openList, row, sidebarButton } from './helpers';

/** Fills the starter lists so every kind of row and badge is on screen. */
async function addContent(page: Page) {
  await openList(page, 'Inbox');
  await addTasks(page, 'Review deck tomorrow 3pm p1', 'Water plants every day', 'Plan offsite');
  await row(page, 'Plan offsite').getByRole('textbox', { name: 'Task' }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Book venue');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await row(page, 'Book venue').getByRole('checkbox').click();
  await addTasks(page, 'Done already');
  await row(page, 'Done already').getByRole('checkbox').click();

  await openList(page, 'Groceries');
  const item = page.getByRole('textbox', { name: 'Add an item' });
  for (const text of ['2 lemons', 'milk 1 l']) {
    await item.fill(text);
    await item.press('Enter');
  }
  await row(page, 'milk').getByRole('checkbox').click();
}

const PALETTES = ['Graphite and cobalt', 'Stone and moss', 'Sage study', 'Midnight ink', 'Dusk'];

/** Picks a colour scheme in Settings. */
async function useColourScheme(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('combobox', { name: 'Colour scheme' }).selectOption(name);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

for (const palette of PALETTES)
  for (const theme of ['light', 'dark'] as const) {
    test(`every screen passes axe in ${palette}, ${theme} theme`, async ({ page }) => {
      // Fifteen axe scans don't fit in the default 30 seconds.
      test.slow();
      await page.emulateMedia({ colorScheme: theme });
      await openApp(page);
      await useColourScheme(page, palette);
      await addContent(page);

      await expectAccessible(page);
      await openList(page, 'Inbox');
      await row(page, 'Review deck').hover();
      await row(page, 'Review deck').getByRole('button', { name: 'Open details' }).click();
      await expectAccessible(page);
      await openList(page, 'Welcome');
      await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
      await expectAccessible(page);

      for (const view of [
        'Today',
        'Tomorrow',
        'Next 7 days',
        'Upcoming',
        'Reminders',
        'Archive',
        'Trash',
      ]) {
        await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
        await expect(page.getByRole('heading', { level: 1, name: view })).toBeVisible();
        await expectAccessible(page);
      }

      for (const shortcut of ['ControlOrMeta+,', 'ControlOrMeta+/', 'ControlOrMeta+k']) {
        await page.keyboard.press(shortcut);
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectAccessible(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
      }
    });
  }

test.describe('keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openList(page, 'Inbox');
    await addTasks(page, 'First task', 'Second task');
  });

  test('F6 moves between the sidebar, the list and the details panel', async ({ page }) => {
    await row(page, 'Second task').click({ position: { x: 400, y: 10 } });
    await page.keyboard.press('ControlOrMeta+i');
    const details = page.getByRole('complementary', { name: 'Task details' });
    await expect(details).toBeVisible();

    await page.keyboard.press('F6');
    await expect(details.getByRole('button').first()).toBeFocused();
    await page.keyboard.press('F6');
    await expect(sidebarButton(page, 'Inbox')).toBeFocused();
    await page.keyboard.press('F6');
    await expect(row(page, 'Second task')).toBeFocused();
    await page.keyboard.press('Shift+F6');
    await expect(sidebarButton(page, 'Inbox')).toBeFocused();
  });

  test('Escape in the details panel hands focus back to the task', async ({ page }) => {
    await row(page, 'First task').click({ position: { x: 400, y: 10 } });
    await page.keyboard.press('ControlOrMeta+i');
    const details = page.getByRole('complementary', { name: 'Task details' });
    await details.getByRole('button', { name: 'Priority 1' }).focus();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(row(page, 'First task')).toBeFocused();
  });

  test('the done checkbox in the details panel is in the Tab order', async ({ page }) => {
    await row(page, 'First task').click({ position: { x: 400, y: 10 } });
    await page.keyboard.press('ControlOrMeta+i');
    const details = page.getByRole('complementary', { name: 'Task details' });
    await details.getByRole('button', { name: 'Close details' }).focus();
    await page.keyboard.press('Tab');
    await expect(details.getByRole('checkbox', { name: 'Mark as done' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(details.getByRole('checkbox', { name: 'Mark as not done' })).toBeChecked();
  });

  test('Shift+F10 opens the menu of the focused task', async ({ page }) => {
    await row(page, 'First task').click({ position: { x: 400, y: 10 } });
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Open details' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('a folder menu opens from the keyboard', async ({ page }) => {
    await sidebarButton(page, 'Work').focus();
    await page.keyboard.press('Tab');
    const actions = page.getByRole('button', { name: 'Work actions' });
    await expect(actions).toBeFocused();
    await expect(actions).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(actions).toBeFocused();

    await sidebarButton(page, 'Work').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menuitem', { name: 'Delete folder' })).toBeVisible();
  });
});
