import clsx from 'clsx';
import { Popover as P } from 'radix-ui';
import type { ReactNode } from 'react';

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  side,
  className,
}: PopoverProps) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          side={side}
          sideOffset={6}
          className={clsx(
            'z-50 rounded-lg border border-line bg-elevated p-3 text-sm shadow-popover outline-none',
            className,
          )}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export const PopoverClose = P.Close;
