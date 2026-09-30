import clsx from 'clsx';
import { formatShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';

export interface KbdProps {
  /** A shortcut such as `Mod+Shift+Z`, shown with the platform's symbols. */
  shortcut: string;
  className?: string;
  /** Text only, without the key-cap border. */
  plain?: boolean;
}

export function Kbd({ shortcut, className, plain }: KbdProps) {
  return (
    <kbd
      className={clsx(
        'font-sans text-xs tracking-wide',
        !plain && 'rounded border border-line-strong px-1 py-px text-fg-muted',
        className,
      )}
    >
      {formatShortcut(shortcut, isMac)}
    </kbd>
  );
}
