import clsx from 'clsx';
import type { ColorName, ListType } from '@/data/types';
import { colorVar } from '@/lib/theme';
import { LIST_TYPE_ICON } from './listTypeIcons';

export function ListIcon({
  type,
  color,
  className,
}: {
  type: ListType;
  color?: ColorName | null;
  className?: string;
}) {
  const Icon = LIST_TYPE_ICON[type];
  return (
    <Icon
      aria-hidden
      className={clsx('size-4 shrink-0', !color && 'text-fg-muted', className)}
      style={{ color: colorVar(color) }}
    />
  );
}
