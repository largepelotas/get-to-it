import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { todayKey } from '@/lib/dates';
import { createList } from './actions/lists';
import { flushWrites, resetForTests, useData } from './data';
import { compileQuery, filterRows } from './filters';
import { checkedDays, currentStreak } from './habits';
import { resetSampleData, seedSampleData } from './sampleData';
import { seedIfNeeded } from './seed';
import { makeSnapshot, parseSnapshot, snapshotToJson } from './snapshot';

const NOW = new Date(2026, 9, 2, 14, 30);

let repo: MemoryRepository;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
});

describe('seedSampleData', () => {
  it('fills a new data set, in place of the starter lists', async () => {
    expect(seedSampleData(NOW)).toBe(true);
    seedIfNeeded();
    const { tables, settings, past } = useData.getState();
    const live = Object.values(tables.lists).filter((l) => !l.deletedAt && !l.archivedAt);
    expect(new Set(live.map((l) => l.type))).toEqual(new Set(['todo', 'grocery', 'note', 'habit']));
    expect(live.filter((l) => l.title === 'Inbox')).toHaveLength(1);
    expect(tables.lists[settings.defaultListId!].title).toBe('Inbox');
    expect(Object.keys(tables.items).length).toBeGreaterThan(150);
    expect(Object.keys(tables.checkIns).length).toBeGreaterThan(500);
    expect(Object.keys(tables.completions).length).toBeGreaterThan(300);
    expect(Object.keys(tables.focusSessions).length).toBeGreaterThan(50);
    expect(settings.seeded).toBe(true);
    expect(past).toHaveLength(0);

    await flushWrites();
    expect(Object.keys((await repo.load()).tables.lists)).toHaveLength(
      Object.keys(tables.lists).length,
    );
  });

  it('makes data an export and import keeps as it is', () => {
    seedSampleData(NOW);
    const { tables, settings } = useData.getState();
    const back = parseSnapshot(snapshotToJson(makeSnapshot(tables, settings)));
    expect(back.tables).toEqual(tables);
  });

  it('puts nothing in the future', () => {
    seedSampleData(NOW);
    const { tables } = useData.getState();
    const now = NOW.getTime();
    for (const item of Object.values(tables.items)) {
      expect(item.completedAt ?? 0).toBeLessThanOrEqual(now);
      expect(item.checked).toBe(item.completedAt !== null);
      // An open task never sits under a finished one.
      if (!item.checked && item.parentId) expect(tables.items[item.parentId].checked).toBe(false);
    }
    for (const c of Object.values(tables.completions))
      expect(c.completedAt).toBeLessThanOrEqual(now);
    for (const s of Object.values(tables.focusSessions)) expect(s.endedAt).toBeLessThanOrEqual(now);
    for (const c of Object.values(tables.checkIns)) expect(c.day <= todayKey(NOW)).toBe(true);
  });

  it('has filters that all read and match something', () => {
    seedSampleData(NOW);
    const { tables } = useData.getState();
    const today = todayKey(NOW);
    for (const filter of Object.values(tables.filters)) {
      const compiled = compileQuery(filter.query, tables, today);
      if (!compiled.ok) throw new Error(`${filter.query}: ${compiled.error}`);
      const rows = filterRows(tables.items, tables.lists, compiled.match);
      expect(rows.length, filter.query).toBeGreaterThan(0);
    }
  });

  it('gives the first habit a streak that reaches today', () => {
    seedSampleData(NOW);
    const { tables } = useData.getState();
    const walk = Object.values(tables.items).find((i) => i.text === 'Morning walk')!;
    const days = checkedDays(Object.values(tables.checkIns), walk.id);
    expect(currentStreak(walk.habit!, days, todayKey(NOW))).toBeGreaterThanOrEqual(13);
  });

  it('leaves reminders that are already past in the inbox', () => {
    seedSampleData(NOW);
    const { tables } = useData.getState();
    const bill = Object.values(tables.items).find((i) => i.text === 'Pay the electricity bill')!;
    const reminder = Object.values(tables.reminders).find((r) => r.itemId === bill.id)!;
    expect(reminder.firedFor).not.toBeNull();
  });

  it('leaves existing data alone', () => {
    createList({ type: 'note', title: 'Mine' });
    expect(seedSampleData(NOW)).toBe(false);
    expect(Object.keys(useData.getState().tables.lists)).toHaveLength(1);
  });

  it('runs only once', () => {
    seedSampleData(NOW);
    const count = Object.keys(useData.getState().tables.items).length;
    expect(seedSampleData(NOW)).toBe(false);
    expect(Object.keys(useData.getState().tables.items)).toHaveLength(count);
  });
});

describe('resetSampleData', () => {
  it('replaces everything with a fresh set and keeps the settings', async () => {
    seedSampleData(NOW);
    createList({ type: 'note', title: 'Mine' });
    useData.setState((s) => ({ settings: { ...s.settings, theme: 'dark' } }));
    const before = Object.keys(useData.getState().tables.lists);

    await resetSampleData(NOW);
    const { tables, settings } = useData.getState();
    expect(Object.values(tables.lists).some((l) => l.title === 'Mine')).toBe(false);
    expect(Object.keys(tables.lists)).toHaveLength(before.length - 1);
    expect(Object.keys(tables.lists).some((id) => before.includes(id))).toBe(false);
    expect(settings.theme).toBe('dark');
    expect(tables.lists[settings.defaultListId!].title).toBe('Inbox');
  });
});
