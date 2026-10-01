import clsx from 'clsx';
import type { ComponentProps } from 'react';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-elevated text-fg hover:bg-hover',
  ghost: 'text-fg hover:bg-hover',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
  /** A secondary button for destructive actions. */
  'danger-secondary': 'border border-line-strong bg-elevated text-danger hover:bg-danger-soft',
} as const;

const SIZES = {
  sm: 'h-7 gap-1.5 px-2.5 text-[13px]',
  md: 'h-8 gap-2 px-3.5 text-sm',
} as const;

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
