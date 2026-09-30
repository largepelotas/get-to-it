import clsx from 'clsx';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned under the content. */
  footer?: ReactNode;
  className?: string;
  /** Focus something other than the first focusable element when opening. */
  onOpenAutoFocus?: (event: Event) => void;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  onOpenAutoFocus,
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <D.Content
          onOpenAutoFocus={onOpenAutoFocus}
          className={clsx(
            'fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-elevated p-5 shadow-popover outline-none',
            className,
          )}
        >
          <D.Title className="text-[15px] font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1.5 text-sm text-fg-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
