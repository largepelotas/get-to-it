import type { ColorName, Priority } from '@/data/types';

export const PRIORITIES: Priority[] = [0, 1, 2, 3];

export const PRIORITY_COLOR: Record<Priority, ColorName | null> = {
  0: null,
  1: 'red',
  2: 'amber',
  3: 'blue',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: 'No priority',
  1: 'Priority 1',
  2: 'Priority 2',
  3: 'Priority 3',
};
