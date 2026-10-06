import { expect, test, type Page } from '@playwright/test';
import { openApp, sidebar } from './helpers';

async function newNote(page: Page) {
  await openApp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByRole('radio', { name: 'Note' }).check();
  await dialog.getByLabel('Name').fill('Outline');
  await dialog.getByRole('button', { name: 'Create' }).click();
  const editor = page.getByRole('textbox', { name: 'Note' });
  await editor.click();
  return editor;
}

const style = (el: Element) => getComputedStyle(el).listStyleType;

// Without the per-depth CSS every nested level reads 1. / 1. / 1. (or stops at circle).
test('numbered lists nest as 1. a. i.', async ({ page }) => {
  const editor = await newNote(page);
  await page.keyboard.type('1. First');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Third');
  await expect(editor.locator('ol ol ol')).toHaveCount(1);
  expect(await editor.locator('ol ol ol').evaluate(style)).toBe('lower-roman');
  expect(await editor.locator('ol ol').first().evaluate(style)).toBe('lower-alpha');
  expect(await editor.locator('ol').first().evaluate(style)).toBe('decimal');
});

test('bullets nest as disc, circle, square', async ({ page }) => {
  const editor = await newNote(page);
  await page.keyboard.type('- First');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Third');
  await expect(editor.locator('ul ul ul')).toHaveCount(1);
  expect(await editor.locator('ul ul ul').evaluate(style)).toBe('square');
  expect(await editor.locator('ul ul').first().evaluate(style)).toBe('circle');
  expect(await editor.locator('ul').first().evaluate(style)).toBe('disc');
});
