import { CalendarCheck, ListTodo, ShoppingCart, StickyNote, type LucideIcon } from 'lucide-react';
import type { ListType } from '@/data/types';

export const LIST_TYPE_ICON: Record<ListType, LucideIcon> = {
  todo: ListTodo,
  grocery: ShoppingCart,
  note: StickyNote,
  habit: CalendarCheck,
};
