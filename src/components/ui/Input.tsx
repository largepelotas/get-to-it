import clsx from 'clsx';
import type { ComponentProps } from 'react';

export const inputClass =
  'h-8 w-full rounded-md border border-line-control bg-surface px-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={clsx(inputClass, 'pr-7', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={clsx('mb-1.5 block text-xs font-medium text-fg-muted', className)}
      {...props}
    />
  );
}
