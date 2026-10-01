import { expect, test } from '@playwright/test';
import { openApp, sidebar } from './helpers';

test('writes a note with Markdown shortcuts and keeps it after a reload', async ({ page }) => {
  await openApp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByRole('radio', { name: 'Note' }).check();
  await dialog.getByLabel('Name').fill('Meeting notes');
  await dialog.getByRole('button', { name: 'Create' }).click();

  const editor = page.getByRole('textbox', { name: 'Note' });
  await editor.click();
  await page.keyboard.type('# Agenda');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- Budget');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hiring');
  await expect(editor.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(editor.getByRole('listitem')).toHaveText(['Budget', 'Hiring']);

  await page.waitForTimeout(400);
  await page.reload();
  await sidebar(page).getByRole('button', { name: 'Meeting notes' }).click();
  const reloaded = page.getByRole('textbox', { name: 'Note' });
  await expect(reloaded.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(reloaded.getByRole('listitem')).toHaveText(['Budget', 'Hiring']);
});
