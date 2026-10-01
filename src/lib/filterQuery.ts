import * as chrono from 'chrono-node';
import type { Item, Label, List, Priority } from '@/data/types';
import { addDaysKey, isDateKey, toDateKey, type DateKey } from './dates';

/*
 * The language of saved filters, close to Todoist's: terms joined with `&`
 * (and), `|` (or) and `!` (not), grouped with brackets.
 *
 *   p1 & overdue            #Work & 7 days          @home | @errands
 *   !(p1 | p2) & no date    before 1 dec            search: dentist
 *
 * A query is parsed once into a tree (`parseFilter`), then turned into a
 * matcher against the data it names (`compileFilter`): list and label names
 * resolve to ids, and relative dates to the day the view is shown.
 */

export type FilterNode =
  | { kind: 'and'; nodes: FilterNode[] }
  | { kind: 'or'; nodes: FilterNode[] }
  | { kind: 'not'; node: FilterNode }
  | { kind: 'all' }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'overdue' }
  | { kind: 'noDate' }
  /** Due within the next `days` days, today included. */
  | { kind: 'days'; days: number }
  /** `text` is as typed ("1 dec", "next monday", "2026-12-01"); it's read when the filter is compiled. */
  | { kind: 'before' | 'after' | 'on'; text: string }
  | { kind: 'list'; name: string }
  | { kind: 'label'; name: string }
  | { kind: 'noLabel' }
  | { kind: 'search'; text: string }
  | { kind: 'recurring' }
  | { kind: 'subtask' };

export type ParseResult = { ok: true; node: FilterNode } | { ok: false; error: string };

/** Examples for the help text under the query field, in the order they're shown. */
export const FILTER_SYNTAX: { example: string; meaning: string }[] = [
  { example: 'p1, p2, p3, no priority', meaning: 'by priority' },
  { example: 'today, tomorrow, overdue, no date', meaning: 'by due date' },
  { example: '7 days, before 1 dec, after friday, on 2026-12-01', meaning: 'by a date or range' },
  { example: '#Work, @home, no labels', meaning: 'by list or label' },
  { example: 'search: dentist, recurring, subtask', meaning: 'by text or kind' },
  { example: '& | ! ( )', meaning: 'and, or, not, brackets' },
];

type Op = '&' | '|' | '!' | '(' | ')';
type Token = { type: 'op'; value: Op } | { type: 'term'; text: string };

const OPS: Op[] = ['&', '|', '!', '(', ')'];
const isOperator = (c: string): c is Op => OPS.includes(c as Op);

/** Splits a query at its operators. Quoted text is kept whole, quotes included. */
function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let term = '';
  const flush = () => {
    const text = term.trim();
    if (text) tokens.push({ type: 'term', text });
    term = '';
  };
  for (let i = 0; i < query.length; i++) {
    const c = query[i];
    if (c === '"' || c === '“' || c === '”') {
      const close = query.indexOf(c === '“' ? '”' : c === '”' ? '“' : '"', i + 1);
      const end = close < 0 ? query.length : close + 1;
      term += query.slice(i, end);
      i = end - 1;
    } else if (isOperator(c)) {
      flush();
      tokens.push({ type: 'op', value: c });
    } else term += c;
  }
  flush();
  return tokens;
}

export class FilterSyntaxError extends Error {}

const quote = (text: string) => `“${text}”`;
/** Strips one pair of straight or curly quotes. */
const unquote = (text: string) => text.replace(/^["“”](.*)["“”]$/s, '$1').trim();

/** One term as typed, e.g. `p1`, `#Work`, `before 1 dec`. Throws for anything else. */
function parseTerm(raw: string): FilterNode {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (text.startsWith('#')) {
    const name = unquote(text.slice(1));
    if (!name) throw new FilterSyntaxError('Give the list a name after #.');
    return { kind: 'list', name };
  }
  if (text.startsWith('@')) {
    const name = unquote(text.slice(1));
    if (!name) throw new FilterSyntaxError('Give the label a name after @.');
    return { kind: 'label', name };
  }
  if (/^["“”]/.test(text)) return { kind: 'search', text: unquote(text) };
  const search = lower.match(/^search\s*:\s*(.*)$/s);
  if (search) {
    const needle = unquote(text.slice(text.length - search[1].length));
    if (!needle) throw new FilterSyntaxError('Give some text after search:.');
    return { kind: 'search', text: needle };
  }
  switch (lower) {
    case 'all':
      return { kind: 'all' };
    case 'today':
      return { kind: 'today' };
    case 'tomorrow':
      return { kind: 'tomorrow' };
    case 'overdue':
      return { kind: 'overdue' };
    case 'no date':
    case 'no due date':
      return { kind: 'noDate' };
    case 'no priority':
    case 'p4':
      return { kind: 'priority', priority: 0 };
    case 'no label':
    case 'no labels':
      return { kind: 'noLabel' };
    case 'recurring':
    case 'repeating':
      return { kind: 'recurring' };
    case 'subtask':
      return { kind: 'subtask' };
  }
  const priority = lower.match(/^p([123])$/);
  if (priority) return { kind: 'priority', priority: Number(priority[1]) as Priority };
  const days = lower.match(/^(?:next\s+)?(\d+)\s*days?$/);
  if (days) {
    const n = Number(days[1]);
    if (n < 1) throw new FilterSyntaxError('The number of days has to be at least 1.');
    return { kind: 'days', days: n };
  }
  const ranged = lower.match(/^(?:due\s+)?(before|after|on)\s*:?\s+(.+)$/s);
  if (ranged) {
    const when = unquote(text.slice(text.length - ranged[2].length));
    return { kind: ranged[1] as 'before' | 'after' | 'on', text: when };
  }
  const due = lower.match(/^due\s*:?\s+(.+)$/s);
  if (due) return { kind: 'on', text: unquote(text.slice(text.length - due[1].length)) };
  throw new FilterSyntaxError(
    `${quote(text)} isn’t a search term. Try p1, today, overdue, #List or @label.`,
  );
}

/** Reads a query into a tree, or says what's wrong with it. */
export function parseFilter(query: string): ParseResult {
  const tokens = tokenize(query);
  if (!tokens.length) return { ok: false, error: 'Type a search, e.g. p1 & overdue.' };
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (value: string) => {
    const t = peek();
    return t?.type === 'op' && t.value === value;
  };
  const after = (value: string) => (value === '(' ? 'after the opening bracket' : `after ${value}`);

  function or(): FilterNode {
    const nodes = [and()];
    while (isOp('|')) {
      i++;
      nodes.push(and());
    }
    return nodes.length === 1 ? nodes[0] : { kind: 'or', nodes };
  }
  function and(): FilterNode {
    const nodes = [not()];
    while (isOp('&')) {
      i++;
      nodes.push(not());
    }
    return nodes.length === 1 ? nodes[0] : { kind: 'and', nodes };
  }
  function not(): FilterNode {
    if (isOp('!')) {
      i++;
      return { kind: 'not', node: not() };
    }
    return atom();
  }
  function atom(): FilterNode {
    const t = peek();
    const previous = tokens[i - 1];
    const where = previous?.type === 'op' ? after(previous.value) : 'at the start';
    if (!t) throw new FilterSyntaxError(`Something is missing ${where}.`);
    if (t.type === 'op') {
      if (t.value === '(') {
        i++;
        const node = or();
        if (!isOp(')')) throw new FilterSyntaxError('Missing a closing bracket.');
        i++;
        return node;
      }
      if (t.value === ')')
        throw new FilterSyntaxError('There’s a closing bracket with no opening one.');
      throw new FilterSyntaxError(`Something is missing ${where}.`);
    }
    i++;
    return parseTerm(t.text);
  }

  try {
    const node = or();
    const left = peek();
    if (left) {
      if (left.type === 'op' && left.value === ')') {
        throw new FilterSyntaxError('There’s a closing bracket with no opening one.');
      }
      throw new FilterSyntaxError(
        `${quote(left.type === 'term' ? left.text : left.value)} isn’t expected there. Join terms with & or |.`,
      );
    }
    return { ok: true, node };
  } catch (err) {
    if (err instanceof FilterSyntaxError) return { ok: false, error: err.message };
    throw err;
  }
}

/** A date as typed in a query: today, tomorrow, yesterday, 2026-12-01, or anything chrono reads ("1 dec", "next monday"). */
export function readQueryDate(
  text: string,
  today: DateKey,
  now: Date = new Date(),
): DateKey | null {
  const lower = text.trim().toLowerCase();
  if (lower === 'today') return today;
  if (lower === 'tomorrow') return addDaysKey(today, 1);
  if (lower === 'yesterday') return addDaysKey(today, -1);
  if (isDateKey(lower)) return lower;
  const parsed = chrono.parseDate(text, now, { forwardDate: true });
  return parsed ? toDateKey(parsed) : null;
}

export interface FilterContext {
  today: DateKey;
  /** For reading dates like "next monday"; defaults to the clock. */
  now?: Date;
  /** The lists `#Name` can mean (live to-do lists). */
  lists: List[];
  labels: Label[];
}

export type CompileResult =
  { ok: true; match: (item: Item) => boolean } | { ok: false; error: string };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Turns a parsed query into a test on a task, against today's date and the
 * lists and labels that exist. A name that matches nothing is an error, so a
 * filter that has gone stale says so instead of showing an empty view.
 */
export function compileFilter(node: FilterNode, ctx: FilterContext): CompileResult {
  const today = ctx.today;
  try {
    const match = build(node);
    return { ok: true, match };
  } catch (err) {
    if (err instanceof FilterSyntaxError) return { ok: false, error: err.message };
    throw err;
  }

  function date(text: string): DateKey {
    const key = readQueryDate(text, today, ctx.now);
    if (!key) throw new FilterSyntaxError(`${quote(text)} isn’t a date.`);
    return key;
  }

  function build(n: FilterNode): (item: Item) => boolean {
    switch (n.kind) {
      case 'and': {
        const parts = n.nodes.map(build);
        return (item) => parts.every((p) => p(item));
      }
      case 'or': {
        const parts = n.nodes.map(build);
        return (item) => parts.some((p) => p(item));
      }
      case 'not': {
        const inner = build(n.node);
        return (item) => !inner(item);
      }
      case 'all':
        return () => true;
      case 'priority':
        return (item) => (item.priority || 0) === n.priority;
      case 'today':
        return (item) => item.dueDate === today;
      case 'tomorrow': {
        const tomorrow = addDaysKey(today, 1);
        return (item) => item.dueDate === tomorrow;
      }
      case 'overdue':
        return (item) => !!item.dueDate && item.dueDate < today;
      case 'noDate':
        return (item) => !item.dueDate;
      case 'days': {
        const last = addDaysKey(today, n.days - 1);
        return (item) => !!item.dueDate && item.dueDate >= today && item.dueDate <= last;
      }
      case 'before': {
        const key = date(n.text);
        return (item) => !!item.dueDate && item.dueDate < key;
      }
      case 'after': {
        const key = date(n.text);
        return (item) => !!item.dueDate && item.dueDate > key;
      }
      case 'on': {
        const key = date(n.text);
        return (item) => item.dueDate === key;
      }
      case 'list': {
        const ids = new Set(ctx.lists.filter((l) => sameName(l.title, n.name)).map((l) => l.id));
        if (!ids.size) throw new FilterSyntaxError(`There’s no list called ${quote(n.name)}.`);
        return (item) => ids.has(item.listId);
      }
      case 'label': {
        const label = ctx.labels.find((l) => sameName(l.name, n.name));
        if (!label) throw new FilterSyntaxError(`There’s no label called ${quote(n.name)}.`);
        return (item) => (item.labelIds ?? []).includes(label.id);
      }
      case 'noLabel':
        return (item) => !(item.labelIds ?? []).length;
      case 'search': {
        const needle = n.text.toLowerCase();
        return (item) => item.text.toLowerCase().includes(needle);
      }
      case 'recurring':
        return (item) => !!item.recurrence;
      case 'subtask':
        return (item) => !!item.parentId;
    }
  }
}

/** Parses and compiles in one go. */
export function buildFilter(query: string, ctx: FilterContext): CompileResult {
  const parsed = parseFilter(query);
  return parsed.ok ? compileFilter(parsed.node, ctx) : parsed;
}

export interface FilterDefaults {
  /** The one list the query asks for, if it asks for exactly one. */
  listName: string | null;
  labelNames: string[];
  due: 'today' | 'tomorrow' | null;
  priority: Priority | null;
}

/**
 * What a task added in the filter's view should get so that it shows there:
 * the terms the whole query requires (those joined by & at the top level,
 * not inside | or !). "p1 & (@home | @work)" gives priority 1 and nothing
 * else.
 */
export function filterDefaults(node: FilterNode): FilterDefaults {
  const out: FilterDefaults = { listName: null, labelNames: [], due: null, priority: null };
  const required = node.kind === 'and' ? node.nodes : [node];
  const lists: string[] = [];
  for (const n of required) {
    if (n.kind === 'list') lists.push(n.name);
    else if (n.kind === 'label') {
      if (!out.labelNames.some((l) => sameName(l, n.name))) out.labelNames.push(n.name);
    } else if (n.kind === 'today' || n.kind === 'tomorrow') out.due ??= n.kind;
    else if (n.kind === 'priority') out.priority ??= n.priority;
  }
  if (lists.length === 1) out.listName = lists[0];
  return out;
}
