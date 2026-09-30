import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { docFromText, parseDoc, type RichNode } from '@/lib/richText';
import { flushWrites, redo, resetForTests, undo, useData } from '../data';
import { createList } from './lists';
import { setNoteContent } from './notes';

let repo: MemoryRepository;
let list: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0));
  repo = new MemoryRepository();
  resetForTests(repo);
  list = createList({ type: 'note', title: 'Ideas' });
});

afterEach(() => vi.useRealTimers());

const note = () => useData.getState().tables.notes[list];
const past = () => useData.getState().past.length;

const heading = (text: string): RichNode => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
  ],
});

describe('setNoteContent', () => {
  it('stores the doc with its plain text and saves it', async () => {
    setNoteContent(list, heading('Plans'));
    expect(parseDoc(note().content)).toEqual(heading('Plans'));
    expect(note().plainText).toBe('Plans\nBody');
    await flushWrites();
    expect((await repo.load()).tables.notes[list].plainText).toBe('Plans\nBody');
  });

  it('makes one undo step per burst of typing', () => {
    const before = note().content;
    const steps = past();
    setNoteContent(list, docFromText('H'));
    setNoteContent(list, docFromText('He'));
    vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 1));
    setNoteContent(list, docFromText('Hey'));
    expect(past()).toBe(steps + 1);

    // A pause starts a new step.
    vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 10));
    setNoteContent(list, docFromText('Hey you'));
    expect(past()).toBe(steps + 2);

    undo();
    expect(note().plainText).toBe('Hey');
    undo();
    expect(note().content).toBe(before);
    expect(note().plainText).toBe('');
    redo();
    expect(note().plainText).toBe('Hey');
  });

  it('ignores content that has not changed', () => {
    setNoteContent(list, docFromText('Same'));
    const steps = past();
    const updatedAt = note().updatedAt;
    vi.setSystemTime(new Date(2026, 8, 1, 9, 5));
    setNoteContent(list, docFromText('Same'));
    expect(past()).toBe(steps);
    expect(note().updatedAt).toBe(updatedAt);
  });

  it('creates a missing note row, but not for a list that does not exist', () => {
    useData.setState((s) => ({ tables: { ...s.tables, notes: {} } }));
    setNoteContent(list, docFromText('Back'));
    expect(note()).toMatchObject({ id: list, plainText: 'Back' });
    setNoteContent('missing', docFromText('Nope'));
    expect(useData.getState().tables.notes.missing).toBeUndefined();
  });
});
