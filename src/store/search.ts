import type { Item, List, Tables } from '@/data/types';
import { docToPlainText, parseDoc } from '@/lib/richText';

/*
 * Search over everything in memory: list titles, task and grocery item text,
 * task notes and note bodies. Matching ignores case and accents, and every
 * word of the query has to appear somewhere in the result.
 */

/** Text with the parts that matched the query, as [start, end) ranges. */
export interface Snippet {
  text: string;
  ranges: [number, number][];
}

export type SearchResult =
  | { kind: 'list'; id: string; list: List; title: Snippet; score: number }
  | {
      kind: 'item';
      id: string;
      item: Item;
      list: List;
      title: Snippet;
      /** Where the notes matched, when they did. */
      snippet: Snippet | null;
      score: number;
    }
  | {
      kind: 'note';
      id: string;
      list: List;
      title: Snippet;
      snippet: Snippet | null;
      score: number;
    };

export interface SearchResults {
  lists: SearchResult[];
  items: SearchResult[];
  notes: SearchResult[];
}

/** One normalised character per entry, plus where it came from in the original. */
interface Folded {
  text: string;
  /** `map[i]` is the index in the original text of folded character `i`. */
  map: number[];
}

function foldChar(c: string): string {
  return c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Lower case without accents, keeping a map back to the original positions. */
export function fold(text: string): Folded {
  let out = '';
  const map: number[] = [];
  let i = 0;
  for (const c of text) {
    const f = foldChar(c);
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f;
    i += c.length;
  }
  map.push(i);
  return { text: out, map };
}

/** The words of a query, folded. */
export function queryTerms(query: string): string[] {
  return fold(query)
    .text.split(/\s+/)
    .filter((t) => t.length > 0);
}

interface Match {
  start: number;
  end: number;
  /** 3: the whole field, 2: the start of the field, 1: the start of a word, 0: inside a word. */
  quality: number;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function findTerm(folded: Folded, term: string): Match | null {
  let best: Match | null = null;
  let from = 0;
  for (;;) {
    const at = folded.text.indexOf(term, from);
    if (at < 0) break;
    const quality =
      at === 0 && term.length === folded.text.length
        ? 3
        : at === 0
          ? 2
          : !WORD_CHAR.test(folded.text[at - 1])
            ? 1
            : 0;
    if (!best || quality > best.quality) best = { start: at, end: at + term.length, quality };
    if (quality >= 1) break;
    from = at + 1;
  }
  return best;
}

/** Ranges in the original text, merged and sorted. */
function toRanges(folded: Folded, matches: Match[]): [number, number][] {
  const ranges = matches
    .map((m): [number, number] => [folded.map[m.start], folded.map[m.end]])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

interface FieldMatch {
  /** Which terms matched, by index. */
  matched: Set<number>;
  matches: Match[];
  score: number;
}

function matchField(folded: Folded, terms: string[]): FieldMatch & { folded: Folded } {
  const matched = new Set<number>();
  const matches: Match[] = [];
  let score = 0;
  terms.forEach((term, i) => {
    const m = findTerm(folded, term);
    if (!m) return;
    matched.add(i);
    matches.push(m);
    score += [1, 3, 5, 8][m.quality];
  });
  return { folded, matched, matches, score };
}

const SNIPPET_BEFORE = 30;
const SNIPPET_LENGTH = 120;

/** A single line of `text` around its first match, with ellipses where it was cut. */
export function makeSnippet(text: string, ranges: [number, number][]): Snippet {
  if (!ranges.length) return { text: text.slice(0, SNIPPET_LENGTH), ranges: [] };
  const first = ranges[0][0];
  let start = Math.max(0, first - SNIPPET_BEFORE);
  // Start at a line or word boundary when there's one close by.
  const lineStart = text.lastIndexOf('\n', first - 1) + 1;
  if (lineStart > start) start = lineStart;
  else if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < first) start = space + 1;
  }
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  const lineEnd = text.indexOf('\n', first);
  if (lineEnd >= 0 && lineEnd < end) end = lineEnd;
  const prefix = start > 0 && text[start - 1] !== '\n' ? '…' : '';
  const suffix = end < text.length && text[end] !== '\n' ? '…' : '';
  const shift = prefix.length - start;
  return {
    text: prefix + text.slice(start, end) + suffix,
    ranges: ranges
      .filter(([a, b]) => a < end && b > start)
      .map(([a, b]): [number, number] => [Math.max(a, start) + shift, Math.min(b, end) + shift]),
  };
}

// Folding every row's text (and parsing every task's notes) on each keystroke
// would be slow with thousands of items. Rows are replaced, never mutated, so
// both can be cached per row object.
const foldCache = new WeakMap<object, Map<string, Folded>>();
function foldedField(row: object, field: string, text: string): Folded {
  let fields = foldCache.get(row);
  if (!fields) foldCache.set(row, (fields = new Map()));
  let folded = fields.get(field);
  if (!folded) fields.set(field, (folded = fold(text)));
  return folded;
}

const notesTextCache = new WeakMap<Item, string>();
function notesText(item: Item): string {
  if (!item.details) return '';
  let text = notesTextCache.get(item);
  if (text === undefined) {
    text = docToPlainText(parseDoc(item.details));
    notesTextCache.set(item, text);
  }
  return text;
}

/**
 * How well `text` matches the query, on the same scale as result scores, or
 * null when some word is missing.
 */
export function scoreText(text: string, terms: string[]): number | null {
  const m = matchField(fold(text), terms);
  return m.matched.size === terms.length ? m.score : null;
}

const LIMITS = { lists: 8, items: 40, notes: 10 };

/** Archived lists and finished items still show, below everything else. */
const ARCHIVED_PENALTY = 4;
const DONE_PENALTY = 2;

function byScore(a: SearchResult, b: SearchResult): number {
  return b.score - a.score || a.title.text.localeCompare(b.title.text);
}

/**
 * Searches lists, items and notes. Trashed lists and deleted items are left
 * out; archived lists and finished items rank lower.
 */
export function search(
  tables: Pick<Tables, 'lists' | 'items' | 'notes'>,
  query: string,
): SearchResults {
  const terms = queryTerms(query);
  const results: SearchResults = { lists: [], items: [], notes: [] };
  if (!terms.length) return results;
  const all = (m: { matched: Set<number> }) => m.matched.size === terms.length;

  const lists = Object.values(tables.lists).filter((l) => !l.deletedAt);
  const listsById = new Map(lists.map((l) => [l.id, l]));

  for (const list of lists) {
    const archived = list.archivedAt ? ARCHIVED_PENALTY : 0;
    const title = matchField(foldedField(list, 'title', list.title), terms);
    if (list.type !== 'note') {
      if (all(title)) {
        results.lists.push({
          kind: 'list',
          id: list.id,
          list,
          title: { text: list.title, ranges: toRanges(title.folded, title.matches) },
          score: title.score - archived,
        });
      }
      continue;
    }
    // Notes match on the title, the body, or words spread over both.
    const note = tables.notes[list.id];
    const body = note?.plainText ?? '';
    const inBody = matchField(note ? foldedField(note, 'plainText', body) : fold(''), terms);
    if (new Set([...title.matched, ...inBody.matched]).size < terms.length) continue;
    const bodyRanges = toRanges(inBody.folded, inBody.matches);
    results.notes.push({
      kind: 'note',
      id: list.id,
      list,
      title: { text: list.title, ranges: toRanges(title.folded, title.matches) },
      snippet: bodyRanges.length ? makeSnippet(body, bodyRanges) : null,
      // The title counts double, so a note named after the query comes first. Matches in
      // the body count half, as notes on a task do.
      score: title.score * 2 + inBody.score / 2 - archived,
    });
  }

  for (const item of Object.values(tables.items)) {
    if (item.deletedAt) continue;
    const list = listsById.get(item.listId);
    if (!list) continue;
    const text = matchField(foldedField(item, 'text', item.text), terms);
    let snippet: Snippet | null = null;
    let score = text.score;
    if (!all(text)) {
      const notes = notesText(item);
      if (!notes) continue;
      const inNotes = matchField(foldedField(item, 'notes', notes), terms);
      if (new Set([...text.matched, ...inNotes.matched]).size < terms.length) continue;
      snippet = makeSnippet(notes, toRanges(inNotes.folded, inNotes.matches));
      // Matches only in the notes rank below matches in the text.
      score += inNotes.score / 2;
    }
    results.items.push({
      kind: 'item',
      id: item.id,
      item,
      list,
      title: { text: item.text, ranges: toRanges(text.folded, text.matches) },
      snippet,
      score: score - (list.archivedAt ? ARCHIVED_PENALTY : 0) - (item.checked ? DONE_PENALTY : 0),
    });
  }

  results.lists = results.lists.sort(byScore).slice(0, LIMITS.lists);
  results.items = results.items.sort(byScore).slice(0, LIMITS.items);
  results.notes = results.notes.sort(byScore).slice(0, LIMITS.notes);
  return results;
}
