import { expect, test } from '@playwright/test';
import { expectAccessible, openApp, sidebarButton } from './helpers';

const FEED_URL = 'https://example.test/cal.ics';

/** An invented calendar with one event today, 10:00 to 11:00 local time. */
function invented(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Invented//EN',
    'BEGIN:VEVENT',
    'UID:e2e-1@example.test',
    `DTSTART:${day}T100000`,
    `DTEND:${day}T110000`,
    'SUMMARY:Invented planning meeting',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

test('a calendar link shows its events in Today and the Calendar until it is removed', async ({
  page,
}) => {
  // The browser preview fetches the link itself, so answer it here (with the header a real server would need).
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: invented(),
    }),
  );
  await openApp(page);

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

  // Today lists it, read-only.
  await sidebarButton(page, 'Today').click();
  const events = page.getByRole('list', { name: 'Events' });
  await expect(events.getByText('Invented planning meeting')).toBeVisible();
  await expect(events.getByText('Invented', { exact: true })).toBeVisible();
  await expectAccessible(page);

  // So does the calendar, in the month grid and in the week.
  await sidebarButton(page, 'Calendar').click();
  const main = page.getByRole('main');
  const chip = main.getByRole('button', { name: /^Invented planning meeting, .*, Invented$/ });
  await expect(chip).toBeVisible();
  await expectAccessible(page);
  // Clicking it opens a read-only pop-up; Escape closes it and focus returns to the chip.
  await chip.click();
  const details = page.getByRole('dialog', { name: 'Invented planning meeting' });
  await expect(details).toBeVisible();
  await expect(details.getByText('Invented', { exact: true })).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(chip).toBeFocused();
  // Clicking away closes it too.
  await chip.click();
  await expect(details).toBeVisible();
  await main.getByRole('heading', { level: 1 }).click();
  await expect(details).toBeHidden();
  await main.getByRole('button', { name: 'Week' }).click();
  await expect(chip).toBeVisible();
  await expectAccessible(page);

  // Removing the link takes its events away.
  await page.keyboard.press('ControlOrMeta+,');
  await settings.getByRole('button', { name: 'Remove Invented' }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(chip).toBeHidden();
  await sidebarButton(page, 'Today').click();
  await expect(page.getByText('Invented planning meeting')).toBeHidden();
});
