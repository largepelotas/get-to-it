import type { HabitGoal } from '@/data/types';
import { isDateKey, todayKey } from '@/lib/dates';
import { newId } from '@/lib/id';
import { commit } from '../data';
import { sanitizeHabitGoal, sameGoal } from '../habits';
import { insertItem } from './items';

/**
 * Adds a habit with the default goal (every day). The text is taken as is: no date,
 * priority, label or section is read out of it. `atTop` puts it first instead of last.
 * Returns null for blank text or a list that isn't a habit list.
 */
export function addHabit(listId: string, text: string, atTop = false): string | null {
  const name = text.trim();
  if (!name) return null;
  return commit('New habit', (tx) => {
    const list = tx.get('lists', listId);
    if (!list || list.type !== 'habit' || list.deletedAt) return null;
    return insertItem(tx, listId, { text: name, after: atTop ? null : undefined });
  });
}

/** Changes how often a habit is meant to be done. A goal that isn't valid is refused. */
export function setHabitGoal(itemId: string, goal: HabitGoal): void {
  if (!sameGoal(goal, sanitizeHabitGoal(goal))) return;
  commit('Habit goal', (tx) => {
    const item = tx.get('items', itemId);
    if (!item?.habit || item.deletedAt || sameGoal(item.habit, goal)) return;
    tx.update('items', itemId, { habit: goal });
  });
}

/**
 * Checks a habit in for a day, or takes that day's check-in away. Days after today
 * (and anything that isn't a day) are refused.
 */
export function toggleCheckIn(itemId: string, day: string): void {
  if (!isDateKey(day) || day > todayKey()) return;
  commit('Check in', (tx) => {
    const item = tx.get('items', itemId);
    if (!item?.habit || item.deletedAt) return;
    const existing = tx.all('checkIns').filter((c) => c.itemId === itemId && c.day === day);
    if (existing.length) {
      for (const c of existing) tx.remove('checkIns', c.id);
    } else {
      tx.put('checkIns', { id: newId(), itemId, day, createdAt: tx.now });
    }
  });
}
