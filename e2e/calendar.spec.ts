import { expect, test, type Locator, type Page } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

// A Wednesday, so tomorrow is in the same week whatever day the suite runs on.
const NOW = new Date(2026, 9, 7, 12);

test('shows a task on its day with its time, and moves by month', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Dentist tomorrow 9am');
  await sidebarButton(page, 'Calendar').click();

  const main = page.getByRole('main');
  await expect(main.getByText('October 2026')).toBeVisible();
  const chip = page
    .getByRole('region', { name: 'Thursday, October 8, 1 task' })
    .getByRole('button', { name: 'Dentist' });
  await expect(chip.locator('span').first()).toHaveText(/^9(:00)?\s?(AM)?\s*Dentist/i);
  await expect(chip).toHaveAccessibleDescription(/^Due Tomorrow/);

  await main.getByRole('button', { name: 'Next' }).click();
  await expect(main.getByText('November 2026')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dentist' })).toBeHidden();
  await main.getByRole('button', { name: 'Previous' }).click();
  await expect(main.getByText('October 2026')).toBeVisible();
});

test('dragging a task from the Tasks panel onto a day gives it that date', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Floss');
  await sidebarButton(page, 'Calendar').click();
  await page.getByRole('button', { name: 'Tasks' }).click();

  const task = page
    .getByRole('complementary', { name: 'Unscheduled tasks' })
    .getByRole('listitem', { name: 'Floss' });
  await task.hover();
  const grip = task.getByRole('button', { name: 'Drag to move' });
  const from = (await grip.boundingBox())!;
  const cell = page.getByRole('region', { name: 'Wednesday, October 7' });
  const target = (await cell.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 30, from.y - 20, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.move(target.x + target.width / 2 + 2, target.y + target.height / 2 + 2, {
    steps: 3,
  });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(page.getByText('Moved to Today')).toBeVisible();
  const chip = page
    .getByRole('region', { name: 'Wednesday, October 7, 1 task' })
    .getByRole('button', { name: 'Floss' });
  await expect(chip).toHaveAccessibleDescription(/^Due Today/);
  await expect(task).toBeHidden();

  await sidebarButton(page, 'Today').click();
  await expect(row(page, 'Floss')).toBeVisible();
});

/** Drags from the middle of `from` to a point `dx`, `dy` from the top-left of `target`'s box. */
async function dragTo(
  page: Page,
  from: Locator,
  target: Locator,
  at: (box: { x: number; y: number; width: number; height: number }) => { x: number; y: number },
): Promise<void> {
  const start = (await from.boundingBox())!;
  const end = at((await target.boundingBox())!);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 20, start.y + start.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.move(end.x, end.y, { steps: 15 });
  await page.mouse.move(end.x + 1, end.y + 1, { steps: 3 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

test('the week layout draws a timed task as a block, and a drop on the grid sets its time', async ({
  page,
}) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Dentist tomorrow 9am', 'Floss today');
  await sidebarButton(page, 'Calendar').click();
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Week' }).click();

  const tomorrow = page.getByRole('region', { name: 'Thursday, October 8' });
  await expect(tomorrow.getByRole('button', { name: 'Dentist' })).toHaveText(
    /^9(:00|\s?AM)\s*Dentist$/i,
  );

  // Scroll the grid 5 hours down so 10:00 is mid-view (near an edge the drag would auto-scroll).
  // The column's box is on screen, so its 10:00 line is 480px below the box top whatever the scroll.
  const chip = page
    .getByRole('group', { name: 'All day, Wednesday, October 7' })
    .getByRole('button', { name: 'Floss' });
  await expect(chip).toBeVisible();
  await tomorrow.evaluate((el) => (el.parentElement!.parentElement!.scrollTop = 5 * 48));
  const height = (await chip.boundingBox())!.height;
  // The dragged chip's top, not the pointer, picks the time: aim a few pixels below the 10:00 line.
  await dragTo(page, chip, tomorrow, (box) => ({
    x: box.x + box.width / 2,
    y: box.y + 10 * 48 + height / 2 + 3,
  }));

  await expect(page.getByText(/Moved to Tomorrow 10:00/)).toBeVisible();
  const moved = tomorrow.getByRole('button', { name: 'Floss' });
  await expect(moved).toHaveAccessibleDescription(/^Due Tomorrow 10:00/);
});

test('dragging one of two selected Tasks-panel tasks onto the all-day cell moves both', async ({
  page,
}) => {
  await page.clock.setFixedTime(NOW);
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Floss', 'Stretch');
  await sidebarButton(page, 'Calendar').click();
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Week' }).click();
  await page.getByRole('button', { name: 'Tasks' }).click();

  const panel = page.getByRole('complementary', { name: 'Unscheduled tasks' });
  const first = panel.getByRole('listitem', { name: 'Floss' });
  const second = panel.getByRole('listitem', { name: 'Stretch' });
  await first.click();
  await second.click({ modifiers: ['Shift'] });
  await second.hover();
  const grip = second.getByRole('button', { name: 'Drag to move' });
  const cell = page.getByRole('group', { name: 'All day, Wednesday, October 7' });
  await dragTo(page, grip, cell, (box) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }));

  await expect(page.getByText('Moved 2 tasks to Today')).toBeVisible();
  await expect(cell.getByRole('button', { name: 'Floss' })).toBeVisible();
  await expect(cell.getByRole('button', { name: 'Stretch' })).toBeVisible();
});
