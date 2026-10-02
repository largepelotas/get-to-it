import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Opens the app on a fresh data set (each test gets its own browser context,
 * so localStorage starts empty and the starter lists are seeded).
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(sidebarButton(page, 'Inbox')).toBeVisible();
}

export const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Lists' });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A sidebar row by its title. Its accessible name also holds the count, if any. */
export const sidebarButton = (page: Page, name: string) =>
  sidebar(page).getByRole('button', { name: new RegExp(`^${escape(name)}( \\d+)?$`) });

export async function openList(page: Page, name: string): Promise<void> {
  await sidebarButton(page, name).click();
  await expect(page.getByRole('textbox', { name: 'List name' })).toHaveValue(name);
}

/** The rows of the open to-do list, as their accessible names. */
export const taskRows = (page: Page) =>
  page.getByRole('list', { name: 'Tasks', exact: true }).getByRole('listitem');

export const row = (page: Page, name: string) => page.getByRole('listitem', { name, exact: true });

/** Adds tasks through the "Add a task" field. */
export async function addTasks(page: Page, ...texts: string[]): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Add a task' });
  for (const text of texts) {
    await field.fill(text);
    await field.press('Enter');
    await expect(field).toHaveValue('');
  }
}

/**
 * Fails on any axe-core violation of WCAG 2.1 A/AA or best practice. Scan
 * with menus closed: an open menu hides the rest of the page from assistive
 * technology, which axe reports as missing landmarks and headings.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const found = results.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim()}`,
    ),
  );
  expect(found).toEqual([]);
}

/** Creates a list of the given type (as named in the New list dialog) and opens it. */
export async function createList(page: Page, type: string, title: string): Promise<void> {
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByRole('radio', { name: type }).check();
  await dialog.getByLabel('Name').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'List name' })).toHaveValue(title);
}
