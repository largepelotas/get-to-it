/**
 * Captures the README screenshots and the demo video into docs/screenshots/.
 * Run with `npm run screenshots`. It uses the Vite dev server (only the dev
 * build seeds the sample data), reusing one already on port 1420 or starting
 * its own, and pins the clock so the sample data's relative dates are stable.
 */
import {
  chromium,
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openApp, openList, row, settled, sidebarButton, taskRows } from '../e2e/helpers.ts';

const URL = 'http://localhost:1420';
const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const NOW = new Date(2026, 9, 7, 10, 30);
const VIEWPORT = { width: 1280, height: 800 };

const desktopChrome = devices['Desktop Chrome'];
const userAgent =
  process.platform === 'darwin'
    ? desktopChrome.userAgent.replace(/\(Windows[^)]*\)/, '(Macintosh; Intel Mac OS X 10_15_7)')
    : desktopChrome.userAgent;

const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms);

async function isUp(): Promise<boolean> {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

async function startServer(): Promise<ChildProcess | null> {
  if (await isUp()) {
    console.log('Reusing the dev server on port 1420');
    return null;
  }
  console.log('Starting the dev server');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null)
      throw new Error('The dev server exited early (is port 1420 busy?)');
    if (await isUp()) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('The dev server did not come up');
}

async function newContext(
  browser: Browser,
  options: { scale: number; video?: string; cursor?: boolean },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...desktopChrome,
    userAgent,
    baseURL: URL,
    locale: 'en-GB',
    colorScheme: 'light',
    viewport: VIEWPORT,
    deviceScaleFactor: options.scale,
    ...(options.video ? { recordVideo: { dir: options.video, size: VIEWPORT } } : {}),
  });
  await context.clock.setFixedTime(NOW);
  if (options.cursor) {
    // Playwright's videos do not draw the pointer, so draw one.
    await context.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const dot = document.createElement('div');
        dot.setAttribute('aria-hidden', 'true');
        dot.style.cssText =
          'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
          'background:rgba(235,64,52,.6);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);' +
          'pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px)';
        document.documentElement.appendChild(dot);
        document.addEventListener(
          'mousemove',
          (e) => {
            dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
          },
          true,
        );
      });
    });
  }
  return context;
}

async function chooseScheme(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+,');
  await page.getByRole('combobox', { name: 'Colour scheme' }).selectOption(name);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

/** Makes the page quiet: no hover, tooltip, toast or animation in flight. */
async function quiet(page: Page) {
  await page.mouse.move(1100, 20);
  await page
    .getByRole('tooltip')
    .waitFor({ state: 'hidden' })
    .catch(() => {});
  await page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'hidden' })
    .catch(() => {});
  await settled(page);
  await page.waitForTimeout(300);
  await settled(page);
}

async function shot(page: Page, file: string) {
  await quiet(page);
  await page.screenshot({ path: join(OUT, file) });
  console.log(`  ${file}`);
}

async function chooseView(page: Page, layout: string, groupBy: string) {
  await page.getByRole('button', { name: 'View options' }).click();
  const options = page.getByRole('dialog', { name: 'View options' });
  await options
    .getByRole('radiogroup', { name: 'Layout' })
    .getByRole('radio', { name: layout })
    .click();
  await options
    .getByRole('radiogroup', { name: 'Group by' })
    .getByRole('radio', { name: groupBy })
    .click();
  await page.keyboard.press('Escape');
  await options.waitFor({ state: 'hidden' });
}

async function dragCard(page: Page, task: string, column: string) {
  const card = row(page, task);
  await card.hover();
  const grip = card.getByRole('button', { name: 'Drag to move' });
  const from = (await grip.boundingBox())!;
  const target = (await page.getByRole('region', { name: column }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2, { steps: 8 });
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 8 });
  await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 30 });
  await page.mouse.move(target.x + target.width / 2 + 2, target.y + 62, { steps: 5 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

async function screenshots(browser: Browser) {
  const each = async (name: string, run: (page: Page) => Promise<void>) => {
    const context = await newContext(browser, { scale: 2 });
    const page = await context.newPage();
    try {
      await openApp(page);
      await run(page);
    } catch (error) {
      console.error(`Failed while capturing ${name}`);
      throw error;
    } finally {
      await context.close();
    }
  };

  await each('today', async (page) => {
    await sidebarButton(page, 'Today').click();
    const task = row(page, 'Dentist check-up');
    await task.hover();
    await task.getByRole('button', { name: 'Open details' }).click();
    await page.getByRole('complementary', { name: 'Task details' }).waitFor();
    await shot(page, 'today.png');
  });

  await each('list', async (page) => {
    await openRelaunch(page);
    await shot(page, 'list.png');
  });

  await each('calendar', async (page) => {
    await sidebarButton(page, 'Calendar').click();
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await page.getByRole('region', { name: /^Wednesday, / }).waitFor();
    // Scroll the time grid so the working day is in view.
    await page.evaluate(() => {
      const hour = [...document.querySelectorAll('*')].find(
        (el) =>
          el.children.length === 0 && /^(09:00|9 ?am|9:00)$/i.test(el.textContent?.trim() ?? ''),
      );
      let el: Element | null = hour ?? null;
      while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
      if (el && hour) {
        el.scrollTop += hour.getBoundingClientRect().top - el.getBoundingClientRect().top - 20;
      }
    });
    await shot(page, 'calendar.png');
  });

  await each('grocery', async (page) => {
    await openList(page, 'Dinner party');
    await shot(page, 'grocery.png');
  });

  await each('notes', async (page) => {
    await openList(page, 'Meeting notes');
    await shot(page, 'notes.png');
  });

  await each('palette', async (page) => {
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Search and commands' });
    await dialog.getByRole('combobox').fill('launch');
    await dialog.getByRole('option').first().waitFor();
    await shot(page, 'palette.png');
  });

  const schemes: [string, string][] = [
    ['Graphite', 'graphite'],
    ['Paper', 'paper'],
    ['Moss', 'moss'],
    ['Plum', 'plum'],
    ['High contrast', 'high-contrast'],
  ];
  for (const [name, slug] of schemes) {
    await each(`scheme ${name}`, async (page) => {
      await chooseScheme(page, name);
      await openRelaunch(page);
      await shot(page, `schemes-${slug}.png`);
    });
  }

  await each('board', async (page) => {
    await openRelaunch(page);
    await page.getByRole('button', { name: 'Hide sidebar' }).click();
    await chooseView(page, 'Board', 'Priority');
    // Focus returns to the View options button and shows its tooltip; park focus elsewhere,
    // wait for the tooltip to go, then drop focus so no ring shows.
    await expect(page.getByRole('button', { name: 'View options' })).toBeFocused();
    await page.getByRole('textbox', { name: 'Add a task' }).focus();
    await page.mouse.move(1100, 20);
    await expect(page.getByRole('tooltip')).toBeHidden();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.getByRole('region', { name: 'Priority 1' }).waitFor();
    await shot(page, 'board.png');
  });
}

async function video(browser: Browser) {
  const dir = await mkdtemp(join(tmpdir(), 'get-to-it-video-'));
  const context = await newContext(browser, { scale: 1, video: dir, cursor: true });
  const page = await context.newPage();
  const started = Date.now();
  const click = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await page.waitForTimeout(250);
    await locator.click();
  };
  try {
    await openApp(page);
    await page.mouse.move(640, 400);
    await pause(page, 1000);

    // a. Add a task with a natural-language date.
    await openList(page, 'Inbox');
    const field = page.getByRole('textbox', { name: 'Add a task' });
    await click(field);
    await field.pressSequentially('Call the plumber tomorrow at 2pm', { delay: 70 });
    await pause(page);
    await field.press('Enter');
    await pause(page, 1800);

    // b. Complete a task.
    await click(taskRows(page).first().getByRole('checkbox'));
    await pause(page, 1800);

    // c. Command palette to the calendar.
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Search and commands' });
    await dialog.getByRole('combobox').pressSequentially('calendar', { delay: 80 });
    await pause(page);
    await click(dialog.getByRole('option').first());

    // d. The calendar, week layout.
    await page.getByRole('button', { name: 'Week', exact: true }).waitFor();
    await pause(page, 1000);
    await click(page.getByRole('button', { name: 'Week', exact: true }));
    await pause(page, 1800);

    // e. Website relaunch as a board grouped by priority.
    await click(sidebarButton(page, 'Website relaunch').first());
    await pause(page, 1000);
    await click(page.getByRole('button', { name: 'View options' }));
    const options = page.getByRole('dialog', { name: 'View options' });
    await pause(page, 800);
    await click(
      options.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio', { name: 'Board' }),
    );
    await pause(page, 800);
    await click(
      options
        .getByRole('radiogroup', { name: 'Group by' })
        .getByRole('radio', { name: 'Priority' }),
    );
    await pause(page, 800);
    await page.keyboard.press('Escape');
    await options.waitFor({ state: 'hidden' });
    await page.mouse.move(640, 700, { steps: 15 });
    await pause(page, 1500);

    // f. Drag a card to another priority column.
    await dragCard(page, 'Contact form', 'Priority 1');
    await pause(page, 2000);

    // g. Change the colour scheme.
    await page.mouse.move(900, 20, { steps: 15 });
    await pause(page, 500);
    await chooseScheme(page, 'Moss');
    await pause(page, 2500);
  } finally {
    const handle = page.video();
    await context.close();
    if (handle) {
      await handle.saveAs(join(OUT, 'demo.webm'));
      console.log(`  demo.webm (${((Date.now() - started) / 1000).toFixed(1)} s wall clock)`);
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
    await screenshots(browser);
    await video(browser);
  } finally {
    await browser?.close();
    server?.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/** "Website relaunch" is pinned as well as in its folder, so it is in the sidebar twice. */
async function openRelaunch(page: Page): Promise<void> {
  await sidebarButton(page, 'Website relaunch').first().click();
  await expect(page.getByRole('textbox', { name: 'List name' })).toHaveValue('Website relaunch');
}
