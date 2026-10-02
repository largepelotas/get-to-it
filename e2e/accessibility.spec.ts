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

  // A section with a task, so headings are scanned too.
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.keyboard.type('Errands');
  await page.keyboard.press('Enter');
  await addTasks(page, 'Buy stamps /Errands');
  // Labelled tasks, so chips are scanned too.
  await addTasks(page, 'Call the bank @errands @phone', 'Book dentist @phone');

  await openList(page, 'Groceries');
  const item = page.getByRole('textbox', { name: 'Add an item' });
  for (const text of ['2 lemons', 'milk 1 l']) {
    await item.fill(text);
    await item.press('Enter');
  }
  await row(page, 'milk').getByRole('checkbox').click();
}

/** Waits for fades to finish, so axe does not read colours mid-transition. */
async function settled(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
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
      await expectAccessible(page);
      await row(page, 'Review deck').hover();
      await row(page, 'Review deck').getByRole('button', { name: 'Open details' }).click();
      await expectAccessible(page);
      // With a focus timer running: the bar across the top and the clock in the panel.
      await page.getByRole('button', { name: 'Start a stopwatch' }).click();
      const focusBar = page.getByRole('toolbar', { name: 'Focus timer' });
      await expect(focusBar).toBeVisible();
      // A fading toast has part-transparent text, which axe reports as low contrast.
      await expect(page.getByText('Stopwatch running on')).toBeHidden();
      await settled(page);
      await expectAccessible(page);
      await focusBar.getByRole('button', { name: 'Stop' }).click();
      await expect(focusBar).toBeHidden();
      await expect(page.getByText('Stopped · under a minute')).toBeHidden();
      await openList(page, 'Welcome');
      await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
      await expectAccessible(page);

      // The label view, and the label picker open on a labelled task.
      await sidebarButton(page, 'errands').click();
      await expect(page.getByRole('heading', { level: 1, name: 'errands' })).toBeVisible();
      await expectAccessible(page);
      await openList(page, 'Inbox');
      await row(page, 'Call the bank').hover();
      await row(page, 'Call the bank').getByRole('button', { name: 'Open details' }).click();
      await page.getByRole('button', { name: 'Add label' }).click();
      await expect(page.getByRole('group', { name: 'Labels' })).toBeVisible();
      await settled(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('group', { name: 'Labels' })).toBeHidden();

      // The filter dialog, a filter's view, and the sort-and-group popover.
      await page.keyboard.press('ControlOrMeta+k');
      const commands = page.getByRole('dialog', { name: 'Search and commands' });
      await commands.getByRole('combobox').fill('new filter');
      await commands.getByRole('option', { name: 'New filter…' }).click();
      const filterDialog = page.getByRole('dialog', { name: 'New filter' });
      await filterDialog.getByRole('textbox', { name: 'Name' }).fill('Phone calls');
      await filterDialog.getByRole('textbox', { name: 'Search' }).fill('@phone | p1');
      await settled(page);
      await expectAccessible(page);
      await filterDialog.getByRole('button', { name: 'Create' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Phone calls' })).toBeVisible();
      await expectAccessible(page);
      await page.getByRole('button', { name: 'View options' }).click();
      await expect(page.getByRole('dialog', { name: 'View options' })).toBeVisible();
      await settled(page);
      await expectAccessible(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'View options' })).toBeHidden();

      for (const view of [
        'Today',
        'Tomorrow',
        'Next 7 days',
        'Upcoming',
        'Calendar',
        'Eisenhower matrix',
        'Reminders',
        'Archive',
        'Trash',
      ]) {
        await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
        await expect(page.getByRole('heading', { level: 1, name: view })).toBeVisible();
        await expectAccessible(page);
        if (view === 'Calendar') {
          // The Unscheduled panel too.
          await page.getByRole('button', { name: 'Tasks' }).click();
          await expect(
            page.getByRole('complementary', { name: 'Unscheduled tasks' }),
          ).toBeVisible();
          await settled(page);
          await expectAccessible(page);
          await page.getByRole('button', { name: 'Tasks' }).click();
          await expect(page.getByRole('complementary', { name: 'Unscheduled tasks' })).toBeHidden();
          // The week layout too, then back to Month so the setting does not carry on.
          await page.getByRole('button', { name: 'Week', exact: true }).click();
          await expect(page.getByRole('region', { name: /^Friday, / })).toBeVisible();
          await settled(page);
          await expectAccessible(page);
          await page.getByRole('button', { name: 'Month', exact: true }).click();
        }
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
