import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABOUT_LINKS, NOTICES_MARKER, NOTICES_MISSING } from '@/lib/about';
import { AboutSection } from './AboutSection';

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock('@/platform', () => ({ openUrl }));

beforeEach(() => openUrl.mockClear());
afterEach(() => vi.unstubAllGlobals());

const respond = (body: string, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, text: () => Promise.resolve(body) })),
  );

async function openLicences() {
  await userEvent.click(screen.getByRole('button', { name: 'Third-party licences' }));
  return screen.findByRole('dialog', { name: 'Third-party licences' });
}

describe('AboutSection', () => {
  it('shows the version from package.json, or users cannot say which build they have', () => {
    render(<AboutSection />);
    expect(screen.getByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument();
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });

  it.each([
    ['Check for a newer version', ABOUT_LINKS.releases],
    ['Report a problem', ABOUT_LINKS.issues],
    ['Source code', ABOUT_LINKS.source],
  ])('"%s" opens its page in the browser, not in the app window', async (name, url) => {
    render(<AboutSection />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(openUrl).toHaveBeenCalledWith(url);
  });

  it('shows the notices when the file starts with the marker line', async () => {
    respond(`${NOTICES_MARKER}\n\nfoo 1.0 — MIT`);
    render(<AboutSection />);
    await openLicences();
    const block = await screen.findByLabelText('Third-party licence notices');
    expect(block).toHaveTextContent('foo 1.0 — MIT');
    // Focusable, so the keyboard can scroll it (axe: scrollable-region-focusable).
    expect(block).toHaveAttribute('tabindex', '0');
  });

  it('shows the development-build message when the dev server answers with index.html, which would otherwise be shown as notices', async () => {
    respond('<!doctype html><html></html>');
    render(<AboutSection />);
    await openLicences();
    expect(await screen.findByText(NOTICES_MISSING)).toBeInTheDocument();
  });

  it('shows the same message for a 404', async () => {
    respond(NOTICES_MARKER, false);
    render(<AboutSection />);
    await openLicences();
    expect(await screen.findByText(NOTICES_MISSING)).toBeInTheDocument();
  });

  it('shows the same message when the fetch fails, without an unhandled rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('blocked'))),
    );
    render(<AboutSection />);
    await openLicences();
    expect(await screen.findByText(NOTICES_MISSING)).toBeInTheDocument();
  });
});
