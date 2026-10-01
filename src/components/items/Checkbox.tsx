import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Priority } from '@/data/types';
import { colorVar } from '@/lib/theme';
import { PRIORITY_COLOR } from './priority';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. the task text. */
  label: string;
  priority?: Priority;
  disabled?: boolean;
  /** In the Tab order. Off in task rows, which handle Space themselves. */
  tabbable?: boolean;
  className?: string;
}

/**
 * A round task checkbox. By default it's left out of the Tab order: rows
 * handle Space themselves, and Tab indents.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  priority = 0,
  disabled,
  tabbable = false,
  className,
}: CheckboxProps) {
  const color = colorVar(PRIORITY_COLOR[priority]);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={tabbable ? undefined : -1}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors disabled:opacity-50',
        checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-control hover:bg-hover',
        className,
      )}
      style={!checked && color ? { borderColor: color } : undefined}
    >
      {checked && <Check aria-hidden strokeWidth={3} className="size-2.5" />}
    </button>
  );
}
