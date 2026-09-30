import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { docFromText } from '@/lib/richText';
import { createItem, setChecked, setItemNotes, deleteItems } from './actions/items';
import { archiveList, createList, deleteList } from './actions/lists';
import { setNoteContent } from './actions/notes';
import { resetForTests, useData } from './data';
import { fold, makeSnippet, queryTerms, search, type Snippet } from './search';

let work: string;
let groceries: string;
let note: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  work = createList({ type: 'todo', title: 'Work' });
  groceries = createList({ type: 'grocery', title: 'Groceries' });
  note = createList({ type: 'note', title: 'Meeting notes' });
});

const run = (query: string) => search(useData.getState().tables, query);
const titles = (results: { title: Snippet }[]) => results.map((r) => r.title.text);
/** The highlighted parts of a snippet. */
const marked = (s: Snippet | null) => s?.ranges.map(([a, b]) => s.text.slice(a, b)) ?? [];

describe('fold', () => {
  it('drops accents and case, and maps back to the original', () => {
    const f = fold('Crème Brûlée');
    expect(f.text).toBe('creme brulee');
    expect(f.map[6]).toBe(6);
    expect(f.map[f.text.length]).toBe('Crème Brûlée'.length);
  });

  it('splits a query into folded words', () => {
    expect(queryTerms('  Café   AU lait ')).toEqual(['cafe', 'au', 'lait']);
  });
});

describe('search', () => {
  it('returns nothing for an empty query', () => {
    createItem(work, { text: 'Anything' });
    expect(run('   ')).toEqual({ lists: [], items: [], notes: [] });
  });

  it('finds lists by title, and items in to-do and grocery lists', () => {
    createItem(work, { text: 'Groceries budget' });
    createItem(groceries, { text: 'Grapes' });
    const r = run('gro');
    expect(titles(r.lists)).toEqual(['Groceries']);
    expect(titles(r.items)).toEqual(['Groceries budget']);
    expect(run('grape').items[0]).toMatchObject({ kind: 'item', list: { id: groceries } });
  });

  it('ignores accents and case', () => {
    createItem(work, { text: 'Book the Café' });
    expect(titles(run('CAFE').items)).toEqual(['Book the Café']);
    expect(marked(run('cafe').items[0].title)).toEqual(['Café']);
  });

  it('needs every word, in any order and field', () => {
    createItem(work, { text: 'Send the report' });
    createItem(work, { text: 'Send flowers' });
    expect(titles(run('report send').items)).toEqual(['Send the report']);
    expect(marked(run('report send').items[0].title)).toEqual(['Send', 'report']);
  });

  it('ranks whole and prefix matches above matches inside words', () => {
    createItem(work, { text: 'Unplan the week' });
    createItem(work, { text: 'Weekly plan' });
    createItem(work, { text: 'Plan' });
    expect(titles(run('plan').items)).toEqual(['Plan', 'Weekly plan', 'Unplan the week']);
  });

  it('matches task notes with a snippet, below matches in the text', () => {
    const a = createItem(work, { text: 'Call Sam' })!;
    setItemNotes(a, 'Ask about the invoice\nand the dates');
    createItem(work, { text: 'Invoice' });
    const r = run('invoice');
    expect(titles(r.items)).toEqual(['Invoice', 'Call Sam']);
    expect(r.items[0]).toMatchObject({ snippet: null });
    const hit = r.items[1];
    expect(hit.kind === 'item' && hit.snippet?.text).toBe('Ask about the invoice');
    expect(hit.kind === 'item' && marked(hit.snippet)).toEqual(['invoice']);
  });

  it('matches a query split between an item and its notes', () => {
    const a = createItem(work, { text: 'Call Sam' })!;
    setItemNotes(a, 'about the invoice');
    expect(titles(run('sam invoice').items)).toEqual(['Call Sam']);
  });

  it('searches note titles and bodies', () => {
    setNoteContent(note, docFromText('Agenda\nBudget review with finance'));
    const other = createList({ type: 'note', title: 'Budget' });
    const r = run('budget');
    expect(titles(r.notes)).toEqual(['Budget', 'Meeting notes']);
    const body = r.notes[1];
    expect(body.kind === 'note' && body.snippet?.text).toBe('Budget review with finance');
    expect(r.lists).toEqual([]);
    expect(titles(run('meeting finance').notes)).toEqual(['Meeting notes']);
    expect(other).toBeTruthy();
  });

  it('leaves out trashed lists and deleted items, and ranks archived and finished ones lower', () => {
    const old = createList({ type: 'todo', title: 'Old stuff' });
    createItem(old, { text: 'Taxes' });
    archiveList(old);
    const trashed = createList({ type: 'todo', title: 'Trashed' });
    createItem(trashed, { text: 'Taxes' });
    deleteList(trashed);
    const gone = createItem(work, { text: 'Taxes' })!;
    deleteItems([gone]);
    const done = createItem(work, { text: 'Taxes' })!;
    setChecked(done, true);
    createItem(work, { text: 'Taxes' });
    const r = run('taxes');
    expect(r.items.map((i) => (i.kind === 'item' ? [i.list.title, i.item.checked] : null))).toEqual(
      [
        ['Work', false],
        ['Work', true],
        ['Old stuff', false],
      ],
    );
    expect(titles(run('trashed').lists)).toEqual([]);
  });
});

describe('makeSnippet', () => {
  it('cuts long text around the first match at a word boundary', () => {
    const text = `${'lorem ipsum '.repeat(10)}needle ${'dolor sit '.repeat(20)}`;
    const at = text.indexOf('needle');
    const s = makeSnippet(text, [[at, at + 6]]);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(122);
    expect(marked(s)).toEqual(['needle']);
    expect(s.text[1]).not.toBe(' ');
  });

  it('keeps to the matching line', () => {
    const s = makeSnippet('first line\nsecond has it\nthird', [[18, 21]]);
    expect(s.text).toBe('second has it');
    expect(marked(s)).toEqual(['has']);
  });
});
