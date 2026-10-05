export const APP_NAME = 'Get To It';

const REPO = 'https://github.com/largepelotas/get-to-it';

export const ABOUT_LINKS = {
  releases: `${REPO}/releases/latest`,
  issues: `${REPO}/issues/new`,
  source: REPO,
} as const;

/** Where the build-time notices file is served, and its fixed first line (see scripts/third-party-notices.mjs). */
export const NOTICES_PATH = '/third-party-notices.txt';
export const NOTICES_MARKER = 'Get To It — third-party notices';

export const NOTICES_MISSING =
  'Licence notices are included in installed copies of Get To It. This is a development build.';

/**
 * The notices text, or the development-build message when the file is missing, is not
 * the real one (Vite's dev server answers unknown paths with index.html) or can't be read.
 */
export async function loadNotices(): Promise<string> {
  try {
    const response = await fetch(NOTICES_PATH);
    if (!response.ok) return NOTICES_MISSING;
    const text = await response.text();
    return text.startsWith(NOTICES_MARKER) ? text : NOTICES_MISSING;
  } catch {
    return NOTICES_MISSING;
  }
}
