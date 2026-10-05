import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addTasks, openApp, openList, row, sidebarButton } from './helpers';

test('exports everything to JSON and imports it back', async ({ page }) => {
  await openApp(page);
  await openList(page, 'Inbox');
  await addTasks(page, 'Exported task tomorrow p2');

  await page.keyboard.press('ControlOrMeta+,');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const downloading = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Export…' }).click();
  const file = await (await downloading).path();
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  expect(snapshot.app).toBe('get-to-it');
  expect(snapshot.tables.items.map((item: { text: string }) => item.text)).toContain(
    'Exported task',
  );
  await page.keyboard.press('Escape');

  // Change things, then import the file to get the old state back.
  await page.getByRole('button', { name: 'List actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(sidebarButton(page, 'Inbox')).toBeHidden();

  await page.keyboard.press('ControlOrMeta+,');
  const choosing = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Import…' }).click();
  await (await choosing).setFiles(file);
  const confirm = page.getByRole('dialog', { name: 'Replace everything with this file?' });
  await confirm.getByRole('button', { name: 'Replace' }).click();

  await openList(page, 'Inbox');
  await expect(row(page, 'Exported task')).toHaveAccessibleDescription('Due Tomorrow. Priority 2');
});
