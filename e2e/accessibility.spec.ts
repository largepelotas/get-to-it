import { expect, test, type Page } from '@playwright/test';
import {
  addTasks,
  createList,
  expectAccessible,
  openApp,
  openList,
  row,
  settled,
  sidebar,
  sidebarButton,
} from './helpers';

/** A Wednesday morning: 3pm is still ahead, so 'today 3pm' is due but not overdue at any real hour. */
const NOW = new Date(2026, 9, 7, 10);

/** Fills the starter lists so every kind of row and badge is on screen. */
async function addContent(page: Page) {
  await openList(page, 'Inbox');
  await addTasks(
    page,
    'Review deck today 3pm p1',
    'Water plants every day',
    'Plan offsite',
    // Due before the pinned clock, so the overdue styling is scanned too.
    'File expenses yesterday 9am',
  );
  // Both kinds of styling are on screen: due later today, and overdue (shown in the danger colour).
  await expect(
    row(page, 'Review deck').getByRole('button', { name: /^Due date: Today / }),
  ).toBeVisible();
  await expect(
    row(page, 'File expenses').getByRole('button', { name: /^Due date: Yesterday / }),
  ).toBeVisible();
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

const FEED_URL = 'https://example.test/cal.ics';

/** An invented calendar for NOW's day: two timed events and an all-day one. */
function inventedCalendar(): string {
  const day = '20261007';
  const event = (uid: string, summary: string, when: string[]) => [
    'BEGIN:VEVENT',
    `UID:${uid}@example.test`,
    ...when,
    `SUMMARY:${summary}`,
    'END:VEVENT',
  ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Invented//EN',
    ...event('a11y-1', 'Invented planning meeting', [
      `DTSTART:${day}T100000`,
      `DTEND:${day}T110000`,
    ]),
    ...event('a11y-2', 'Invented review', [`DTSTART:${day}T130000`, `DTEND:${day}T133000`]),
    ...event('a11y-3', 'Invented offsite', [
      `DTSTART;VALUE=DATE:${day}`,
      'DTEND;VALUE=DATE:20261008',
    ]),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Adds the invented calendar link in Settings. */
async function addInventedCalendar(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const form = settings.getByRole('form', { name: 'Add a calendar' });
  await form.scrollIntoViewIfNeeded();
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Invented');
  await form.getByRole('textbox', { name: 'Link', exact: true }).fill(FEED_URL);
  await form.getByRole('button', { name: 'Add calendar' }).click();
  await expect(settings.getByText(/^Updated /)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
}

const PALETTES = ['Graphite', 'Paper', 'Moss', 'Plum', 'High contrast'];

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
      // Pinned before the app loads, so what is overdue and what is today never depends on the hour.
      await page.clock.setFixedTime(NOW);
      await page.route(FEED_URL, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/calendar',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: inventedCalendar(),
        }),
      );
      await openApp(page);
      await useColourScheme(page, palette);
      await addContent(page);
      await addInventedCalendar(page);

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

      // A habit list, with a habit checked in and its details open.
      await createList(page, 'Habits', 'Routine');
      const habit = page.getByRole('textbox', { name: 'Add a habit' });
      for (const text of ['Read', 'Stretch']) {
        await habit.fill(text);
        await habit.press('Enter');
      }
      await row(page, 'Read').getByRole('checkbox', { name: 'Read' }).click();
      await row(page, 'Read').click();
      await expect(page.getByRole('complementary', { name: 'Habit details' })).toBeVisible();
      await settled(page);
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
        'Completed',
        'Statistics',
        'Reminders',
        'Archive',
        'Trash',
      ]) {
        // Completed is looked for in the sidebar: a list's own "Completed" toggle starts with the same word.
        await (view === 'Completed' ? sidebar(page) : page)
          .getByRole('button', { name: new RegExp(`^${view}`) })
          .click();
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
          // Month chips on a busy day: a selected task, the "+N more" pop-up, an event's pop-up.
          const today = page.getByRole('region', { name: /^Wednesday, October 7, / });
          await today.getByRole('button', { name: 'Water plants' }).click();
          await settled(page);
          await expectAccessible(page);
          await today.getByRole('button', { name: /more on / }).click();
          await expect(page.getByRole('dialog', { name: 'Wednesday, October 7' })).toBeVisible();
          await settled(page);
          await expectAccessible(page);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: 'Wednesday, October 7' })).toBeHidden();
          await today.getByRole('button', { name: /^Invented planning meeting, / }).click();
          await expect(
            page.getByRole('dialog', { name: 'Invented planning meeting' }),
          ).toBeVisible();
          await settled(page);
          await expectAccessible(page);
          await page.keyboard.press('Escape');
          await expect(
            page.getByRole('dialog', { name: 'Invented planning meeting' }),
          ).toBeHidden();
          // The week layout too (an event block and an all-day entry), then back to Month so the setting does not carry on.
          await page.getByRole('button', { name: 'Week', exact: true }).click();
          await expect(page.getByRole('region', { name: /^Wednesday, October 7$/ })).toBeVisible();
          await expect(
            page
              .getByRole('region', { name: /^Wednesday, October 7$/ })
              .getByRole('button', { name: /^Invented planning meeting, / }),
          ).toBeVisible();
          await expect(
            page
              .getByRole('group', { name: /^All day, Wednesday, October 7$/ })
              .getByRole('button', { name: /^Invented offsite, / }),
          ).toBeVisible();
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

test('Settings → About and the licences dialog pass axe', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+,');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('heading', { name: 'About' }).scrollIntoViewIfNeeded();
  await expect(settings.getByText(/^Version [0-9]/)).toBeVisible();
  await settled(page);
  await expectAccessible(page);

  await settings.getByRole('button', { name: 'Third-party licences' }).click();
  const licences = page.getByRole('dialog', { name: 'Third-party licences' });
  // In CI the preview build has no notices file (npm run notices makes it), so this is the fallback
  // message; on a machine that has run it, it is the real text. Either way, wait for the load.
  await expect(licences.getByLabel('Third-party licence notices')).not.toHaveText('Loading…');
  await settled(page);
  await expectAccessible(page);

  // Closing it goes back to the button, not to nowhere, and leaves Settings open.
  await page.keyboard.press('Escape');
  await expect(licences).toBeHidden();
  await expect(settings.getByRole('button', { name: 'Third-party licences' })).toBeFocused();
  await expect(settings).toBeVisible();
});

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
