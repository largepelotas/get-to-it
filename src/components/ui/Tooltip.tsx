import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

export const TooltipProvider = T.Provider;

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

/** Wraps a single focusable child (use `asChild`-compatible elements). */
export function Tooltip({ content, shortcut, side = 'bottom', children }: TooltipProps) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs text-surface shadow-popover select-none"
        >
          {content}
          {shortcut && <Kbd shortcut={shortcut} className="opacity-70" plain />}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
