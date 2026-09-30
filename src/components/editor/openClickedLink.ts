import type { MouseEvent } from 'react';
import { openUrl } from '@/platform';

/**
 * Handles a click inside rich text: a link never navigates the app's window,
 * and opens in the default browser when `open` is true.
 */
export function openClickedLink(event: MouseEvent, open: boolean): void {
  const link = (event.target as HTMLElement).closest('a[href]');
  if (!link) return;
  event.preventDefault();
  if (open) void openUrl(link.getAttribute('href') ?? '');
}
