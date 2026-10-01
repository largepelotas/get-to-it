import { expect, test } from '@playwright/test';
import { addTasks, openApp, row } from './helpers';

test('a reminder goes off at its time, lands in Reminders and can be snoozed', async ({ page }) => {
  // Record notifications instead of showing them.
  await page.addInitScript(() => {
    const shown: string[] = [];
    Object.assign(window, { shownNotifications: shown });
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string) {
        shown.push(title);
      }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification });
  });
  const start = new Date();
  start.setHours(9, 55, 0, 0);
  await page.clock.install({ time: start });
  await openApp(page);

  await addTasks(page, 'Call Sam today 10am');
  await row(page, 'Call Sam').hover();
  await row(page, 'Call Sam').getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await panel.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('menuitem', { name: 'At due time' }).click();
  await expect(row(page, 'Call Sam')).toHaveAccessibleDescription('Due Today 10:00. Reminder set');

  await page.clock.fastForward('06:00');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { shownNotifications: string[] }).shownNotifications,
      ),
    )
    .toEqual(['Call Sam']);

  await page.getByRole('button', { name: /^Reminders/ }).click();
  const reminded = page.getByRole('region', { name: 'Reminded' });
  await expect(reminded.getByRole('listitem', { name: 'Call Sam' })).toBeVisible();

  await reminded.getByRole('button', { name: 'Snooze' }).click();
  await page.getByRole('menuitem', { name: '10 minutes' }).click();
  await expect(reminded).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Coming up' }).getByRole('listitem', { name: 'Call Sam' }),
  ).toBeVisible();

  await page.clock.fastForward('10:00');
  await expect(reminded.getByRole('listitem', { name: 'Call Sam' })).toBeVisible();
});
