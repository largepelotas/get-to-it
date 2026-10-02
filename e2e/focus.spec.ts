import { expect, test } from '@playwright/test';
import { addTasks, expectAccessible, openApp, row } from './helpers';

test('a Pomodoro runs from a task, is logged when stopped, and a stopwatch is accessible', async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  await openApp(page);
  await addTasks(page, 'Write plan');
  await row(page, 'Write plan').hover();
  await row(page, 'Write plan').getByRole('button', { name: 'Open details' }).click();
  const panel = page.getByRole('complementary', { name: 'Task details' });

  await panel.getByRole('button', { name: 'Start a 25-minute Pomodoro' }).click();
  const bar = page.getByRole('toolbar', { name: 'Focus timer' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText('25:00')).toBeVisible();

  await page.clock.fastForward('01:30');
  await expect(bar.getByText('23:30')).toBeVisible();

  await bar.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Logged 2 min on “Write plan”')).toBeVisible();
  await expect(bar).toBeHidden();
  await expect(
    panel.getByRole('list', { name: 'Focus sessions' }).getByRole('listitem'),
  ).toHaveCount(1);

  await panel.getByRole('button', { name: 'Start a stopwatch' }).click();
  await expect(bar.getByText('Stopwatch')).toBeVisible();
  await expectAccessible(page);
});
