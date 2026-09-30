const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** True for links the app will open: web pages and email addresses. */
export function isSafeUrl(url: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Turns what someone typed into a link address: "example.com" becomes
 * "https://example.com" and "sam@example.com" a mailto link. Returns null for
 * anything the app won't open (blank, `javascript:`, a file path).
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let url: string;
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^:/]+:\d/.test(text)) url = text;
  else if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(text)) url = `mailto:${text}`;
  else url = `https://${text.replace(/^\/\//, '')}`;
  return isSafeUrl(url) ? url : null;
}
