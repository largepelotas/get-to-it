import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  shortcut?: string;
  size?: 'sm' | 'md';
  /** Show the label as a tooltip on hover. */
  tooltip?: boolean;
}

export function IconButton({
  label,
  icon,
  shortcut,
  size = 'md',
  tooltip = true,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-hover data-[state=open]:text-fg',
        size === 'sm' ? 'size-6' : 'size-7',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
