import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { parseDoc } from '@/lib/richText';
import { createList } from './actions/lists';
import { flushWrites, resetForTests, setSetting, useData } from './data';
import { seedIfNeeded } from './seed';

let repo: MemoryRepository;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
});

describe('seedIfNeeded', () => {
  it('creates the starter lists on first launch, without undo history', async () => {
    seedIfNeeded();
    const { tables, settings, past } = useData.getState();
    const lists = Object.values(tables.lists);
    expect(lists.map((l) => `${l.type}:${l.title}`).sort()).toEqual([
      'grocery:Groceries',
      'note:Welcome',
      'todo:Inbox',
    ]);
    expect(Object.values(tables.folders).map((f) => f.name)).toEqual(['Work']);
    const inbox = lists.find((l) => l.title === 'Inbox')!;
    const welcome = lists.find((l) => l.title === 'Welcome')!;
    expect(settings.defaultListId).toBe(inbox.id);
    expect(settings.seeded).toBe(true);
    expect(parseDoc(tables.notes[welcome.id].content)?.content?.[0].type).toBe('heading');
    expect(tables.notes[welcome.id].plainText).toContain('Welcome to Checklist');
    expect(past).toHaveLength(0);

    await flushWrites();
    expect((await repo.load()).settings.seeded).toBe(true);
  });

  it('runs only once', () => {
    seedIfNeeded();
    seedIfNeeded();
    expect(Object.keys(useData.getState().tables.lists)).toHaveLength(3);
  });

  it('leaves existing data alone but picks a default list', () => {
    const note = createList({ type: 'note', title: 'Mine' });
    const todo = createList({ type: 'todo', title: 'Tasks' });
    seedIfNeeded();
    const { tables, settings } = useData.getState();
    expect(Object.keys(tables.lists).sort()).toEqual([note, todo].sort());
    expect(settings.defaultListId).toBe(todo);
  });

  it('does nothing once seeded, even with no lists', () => {
    setSetting('seeded', true);
    seedIfNeeded();
    expect(Object.keys(useData.getState().tables.lists)).toHaveLength(0);
  });
});
