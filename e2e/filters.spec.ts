import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

test('saves a filter, opens its view, sorts and groups Today, and uses the matrix', async ({
  page,
}) => {
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Pay the bill today p1', 'Water the plants today', 'Read a book');

  // A new filter from the palette: the dialog says what it matches as you type.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByRole('combobox').fill('new filter');
  await palette.getByRole('option', { name: 'New filter…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New filter' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Urgent');
  const query = dialog.getByRole('textbox', { name: 'Search' });
  await query.fill('p1 &');
  await expect(dialog.getByRole('alert')).toHaveText('Something is missing after &.');
  await query.fill('p1 & today');
  await expect(dialog.getByRole('status')).toHaveText('Matches 1 task.');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  // Its view opens, with the matching task; the sidebar lists it with a count.
  await expect(page.getByRole('heading', { level: 1, name: 'Urgent' })).toBeVisible();
  await expect(row(page, 'Pay the bill')).toBeVisible();
  await expect(row(page, 'Water the plants')).toBeHidden();
  await expect(sidebarButton(page, 'Urgent')).toHaveText('Urgent1');

  // A task added in the view gets what the query asks for, so it stays.
  await addTasks(page, 'Call the bank');
  await expect(row(page, 'Call the bank')).toBeVisible();
  await expect(row(page, 'Call the bank')).toHaveAccessibleDescription(/Due Today\. Priority 1/);
  await expect(sidebarButton(page, 'Urgent')).toHaveText('Urgent2');

  // Today, sorted by name then grouped by priority.
  await sidebarButton(page, 'Today').click();
  const tasks = page.getByRole('listitem');
  await expect(tasks).toHaveText([/^Pay the bill/, /^Call the bank/, /^Water the plants/]);
  await page.getByRole('button', { name: 'View options' }).click();
  const options = page.getByRole('dialog', { name: 'View options' });
  await options
    .getByRole('radiogroup', { name: 'Sort by' })
    .getByRole('radio', { name: 'Name' })
    .click();
  await expect(tasks).toHaveText([/^Call the bank/, /^Pay the bill/, /^Water the plants/]);
  await options
    .getByRole('radiogroup', { name: 'Group by' })
    .getByRole('radio', { name: 'Priority' })
    .click();
  await expect(page.getByRole('region', { name: 'Priority 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'No priority' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();

  // The matrix puts the urgent and important tasks in the first box.
  await sidebarButton(page, 'Eisenhower matrix').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Eisenhower matrix' })).toBeVisible();
  const box = (name: string) => page.getByRole('region', { name });
  await expect(box('Urgent and important').getByRole('listitem')).toHaveText([
    /^Pay the bill/,
    /^Call the bank/,
  ]);
  await expect(box('Urgent, not important').getByRole('listitem')).toHaveText([
    /^Water the plants/,
  ]);
  await expect(box('Neither').getByRole('listitem')).toHaveText([/^Read a book/]);

  // Edit the filter from its row, then delete it and undo.
  await sidebarButton(page, 'Urgent').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit filter…' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit filter' });
  await edit.getByRole('textbox', { name: 'Search' }).fill('p1');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await sidebarButton(page, 'Urgent').click();
  await expect(page.getByText('p1', { exact: true })).toBeVisible();
  await sidebarButton(page, 'Urgent').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete filter' }).click();
  await expect(sidebarButton(page, 'Urgent')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Urgent' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebarButton(page, 'Urgent')).toBeVisible();
});
