import { describe, expect, it } from 'vitest';
import type { Item, Label, List } from '@/data/types';
import {
  buildFilter,
  filterDefaults,
  parseFilter,
  readQueryDate,
  type FilterContext,
} from './filterQuery';

const today = '2026-10-01';

const list = (id: string, title: string, extra: Partial<List> = {}): List => ({
  id,
  folderId: null,
  type: 'todo',
  title,
  color: null,
  pinned: false,
  sortKey: id,
  showCompleted: false,
  archivedAt: null,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const label = (id: string, name: string): Label => ({
  id,
  name,
  color: null,
  sortKey: id,
  createdAt: 1,
  updatedAt: 1,
});

const item = (text: string, extra: Partial<Item> = {}): Item => ({
  id: text,
  listId: 'work',
  parentId: null,
  text,
  checked: false,
  wontDo: false,
  completedAt: null,
  sortKey: 'a0',
  sectionId: null,
  labelIds: [],
  collapsed: false,
  details: null,
  dueDate: null,
  dueTime: null,
  endTime: null,
  deadline: null,
  priority: 0,
  recurrence: null,
  quantity: null,
  category: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...extra,
});

const ctx: FilterContext = {
  today,
  now: new Date(2026, 9, 1, 12),
  lists: [list('work', 'Work'), list('home', 'Home'), list('side', 'Side projects')],
  labels: [label('err', 'Errands'), label('ph', 'Phone')],
};

/** The texts of the items that pass the query. */
function matching(query: string, items: Item[]): string[] {
  const built = buildFilter(query, ctx);
  if (!built.ok) throw new Error(built.error);
  return items.filter(built.match).map((i) => i.text);
}

const error = (query: string) => {
  const built = buildFilter(query, ctx);
  return built.ok ? null : built.error;
};

describe('parseFilter', () => {
  // Bug prevented: the grammar reading "a | b & c" as "(a | b) & c", or dropping a bracketed group.
  it('gives & precedence over |, and brackets over both', () => {
    expect(parseFilter('p1 | p2 & today')).toEqual({
      ok: true,
      node: {
        kind: 'or',
        nodes: [
          { kind: 'priority', priority: 1 },
          { kind: 'and', nodes: [{ kind: 'priority', priority: 2 }, { kind: 'today' }] },
        ],
      },
    });
    expect(parseFilter('(p1 | p2) & today')).toEqual({
      ok: true,
      node: {
        kind: 'and',
        nodes: [
          {
            kind: 'or',
            nodes: [
              { kind: 'priority', priority: 1 },
              { kind: 'priority', priority: 2 },
            ],
          },
          { kind: 'today' },
        ],
      },
    });
  });

  // Bug prevented: "!" only applying to the next word, or a double negative blowing up.
  it('reads ! as not, including before a bracket and doubled', () => {
    expect(parseFilter('!(p1 | p2)')).toMatchObject({ ok: true, node: { kind: 'not' } });
    expect(parseFilter('!!today')).toEqual({
      ok: true,
      node: { kind: 'not', node: { kind: 'not', node: { kind: 'today' } } },
    });
  });

  // Bug prevented: a list with spaces in its name, or quoted, being cut at the space.
  it('reads every kind of term, any case, with spaces and quotes in names', () => {
    const terms: [string, unknown][] = [
      ['P1', { kind: 'priority', priority: 1 }],
      ['p4', { kind: 'priority', priority: 0 }],
      ['No Priority', { kind: 'priority', priority: 0 }],
      ['today', { kind: 'today' }],
      ['Tomorrow', { kind: 'tomorrow' }],
      ['overdue', { kind: 'overdue' }],
      ['no date', { kind: 'noDate' }],
      ['no due date', { kind: 'noDate' }],
      ['7 days', { kind: 'days', days: 7 }],
      ['next 3 days', { kind: 'days', days: 3 }],
      ['before 1 dec', { kind: 'before', text: '1 dec' }],
      ['due before: 1 Dec', { kind: 'before', text: '1 Dec' }],
      ['after friday', { kind: 'after', text: 'friday' }],
      ['on 2026-12-01', { kind: 'on', text: '2026-12-01' }],
      ['due 2026-12-01', { kind: 'on', text: '2026-12-01' }],
      ['#Side projects', { kind: 'list', name: 'Side projects' }],
      ['#"Side projects"', { kind: 'list', name: 'Side projects' }],
      ['@errands', { kind: 'label', name: 'errands' }],
      ['no labels', { kind: 'noLabel' }],
      ['search: dentist', { kind: 'search', text: 'dentist' }],
      ['"call mum"', { kind: 'search', text: 'call mum' }],
      ['recurring', { kind: 'recurring' }],
      ['subtask', { kind: 'subtask' }],
      ['all', { kind: 'all' }],
    ];
    for (const [text, node] of terms) expect(parseFilter(text), text).toEqual({ ok: true, node });
  });

  // Bug prevented: a typo silently matching nothing instead of being pointed out.
  it('says what is wrong with a bad query', () => {
    expect(parseFilter('')).toEqual({ ok: false, error: 'Type a search, e.g. p1 & overdue.' });
    expect(parseFilter('   ')).toMatchObject({ ok: false });
    expect(parseFilter('p1 overdue')).toEqual({
      ok: false,
      error: '“p1 overdue” isn’t a search term. Try p1, today, overdue, #List or @label.',
    });
    expect(parseFilter('p1 &')).toEqual({ ok: false, error: 'Something is missing after &.' });
    expect(parseFilter('& p1')).toEqual({ ok: false, error: 'Something is missing at the start.' });
    expect(parseFilter('(p1 | p2')).toEqual({ ok: false, error: 'Missing a closing bracket.' });
    expect(parseFilter('p1)')).toEqual({
      ok: false,
      error: 'There’s a closing bracket with no opening one.',
    });
    expect(parseFilter('#')).toEqual({ ok: false, error: 'Give the list a name after #.' });
    expect(parseFilter('0 days')).toMatchObject({ ok: false });
    expect(parseFilter('search:')).toEqual({ ok: false, error: 'Give some text after search:.' });
  });
});

describe('compileFilter', () => {
  const items = [
    item('Overdue p1', { dueDate: '2026-09-28', priority: 1 }),
    item('Today p2', { dueDate: today, priority: 2 }),
    item('Tomorrow', { dueDate: '2026-10-02' }),
    item('Next week', { dueDate: '2026-10-07', priority: 3 }),
    item('December', { dueDate: '2026-12-01' }),
    item('Undated home', { listId: 'home', labelIds: ['err', 'ph'] }),
    item('Side project', {
      listId: 'side',
      labelIds: ['ph'],
      recurrence: { freq: 'daily' } as never,
    }),
    item('A subtask', { parentId: 'Today p2' }),
  ];

  // Bug prevented: "7 days" taking in overdue tasks, or the day after the week.
  it('matches by priority and date', () => {
    expect(matching('p1', items)).toEqual(['Overdue p1']);
    expect(matching('no priority', items)).toEqual([
      'Tomorrow',
      'December',
      'Undated home',
      'Side project',
      'A subtask',
    ]);
    expect(matching('today', items)).toEqual(['Today p2']);
    expect(matching('tomorrow', items)).toEqual(['Tomorrow']);
    expect(matching('overdue', items)).toEqual(['Overdue p1']);
    expect(matching('no date', items)).toEqual(['Undated home', 'Side project', 'A subtask']);
    expect(matching('7 days', items)).toEqual(['Today p2', 'Tomorrow', 'Next week']);
    expect(matching('6 days', items)).toEqual(['Today p2', 'Tomorrow']);
    expect(matching('before today', items)).toEqual(['Overdue p1']);
    expect(matching('after 2026-10-02', items)).toEqual(['Next week', 'December']);
    expect(matching('on 1 dec', items)).toEqual(['December']);
    expect(matching('before 1 dec & after today', items)).toEqual(['Tomorrow', 'Next week']);
  });

  // Bug prevented: a list name matched case-sensitively, or a label matched by id rather than name.
  it('matches by list, label, text and kind', () => {
    expect(matching('#home', items)).toEqual(['Undated home']);
    expect(matching('#"side projects"', items)).toEqual(['Side project']);
    expect(matching('@Errands', items)).toEqual(['Undated home']);
    expect(matching('@phone & !@errands', items)).toEqual(['Side project']);
    expect(matching('no labels & no date', items)).toEqual(['A subtask']);
    expect(matching('search: p', items)).toEqual(['Overdue p1', 'Today p2', 'Side project']);
    expect(matching('"side"', items)).toEqual(['Side project']);
    expect(matching('recurring', items)).toEqual(['Side project']);
    expect(matching('subtask', items)).toEqual(['A subtask']);
    expect(matching('all', items)).toHaveLength(items.length);
  });

  it('combines terms', () => {
    expect(matching('(p1 | p2) & !overdue', items)).toEqual(['Today p2']);
    expect(matching('overdue | today', items)).toEqual(['Overdue p1', 'Today p2']);
    expect(matching('#work & no date & !subtask', items)).toEqual([]);
  });

  // Bug prevented: a filter naming a deleted list quietly showing nothing.
  it('reports a list, label or date that does not exist', () => {
    expect(error('#Nowhere')).toBe('There’s no list called “Nowhere”.');
    expect(error('@nothing & p1')).toBe('There’s no label called “nothing”.');
    expect(error('before blorp')).toBe('“blorp” isn’t a date.');
    expect(error('p1 |')).toBe('Something is missing after |.');
  });
});

describe('dates and quotes in queries', () => {
  // Bug prevented: junk, a lone time or a month 13 being read as some date, so the filter matched the wrong tasks.
  it('rejects text that is not wholly a date naming a day', () => {
    for (const q of [
      'on 2026-13-01',
      'on garbage tomorrow',
      'after 3pm',
      'on noon',
      'before next week',
    ]) {
      expect(error(q), q).toMatch(/isn’t a date\.$/);
    }
    for (const q of ['before 1 dec', 'after friday', 'on 2026-12-01', 'on next monday']) {
      expect(error(q), q).toBeNull();
    }
  });

  // Bug prevented: an unclosed quote silently swallowing the rest of the query.
  it('reports an unclosed quote', () => {
    for (const q of [
      '"dentist',
      'search: "dentist',
      '#"Side projects',
      '“dentist',
      'search: “dentist”  & "x',
    ]) {
      expect(error(q), q).toBe('Missing a closing quote.');
    }
  });

  // Bug prevented: an empty quoted search matching every task.
  it('reports an empty quoted search', () => {
    expect(error('""')).toBe('Give some text to search for.');
    expect(error('search: ""')).toBe('Give some text after search:.');
  });
});

describe('readQueryDate', () => {
  // Bug prevented: "friday" read as last Friday, or an ISO date shifted by the time zone.
  it('reads relative words, ISO dates and natural dates forwards', () => {
    const now = new Date(2026, 9, 1, 12); // a Thursday
    expect(readQueryDate('today', today, now)).toBe('2026-10-01');
    expect(readQueryDate('Tomorrow', today, now)).toBe('2026-10-02');
    expect(readQueryDate('yesterday', today, now)).toBe('2026-09-30');
    expect(readQueryDate('2026-12-01', today, now)).toBe('2026-12-01');
    expect(readQueryDate('friday', today, now)).toBe('2026-10-02');
    expect(readQueryDate('1 dec', today, now)).toBe('2026-12-01');
    expect(readQueryDate('not a date', today, now)).toBeNull();
  });
});

describe('filterDefaults', () => {
  // Bug prevented: a task added in "@home | @work" getting both labels, or one added in
  // "!p1" getting priority 1.
  it('takes only what the whole query requires', () => {
    const node = (q: string) => {
      const parsed = parseFilter(q);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.node;
    };
    expect(filterDefaults(node('p1 & @home & #Work & today'))).toEqual({
      listName: 'Work',
      labelNames: ['home'],
      due: 'today',
      priority: 1,
    });
    expect(filterDefaults(node('@home | @work'))).toEqual({
      listName: null,
      labelNames: [],
      due: null,
      priority: null,
    });
    expect(filterDefaults(node('!p1 & (today | tomorrow) & @a & @A'))).toEqual({
      listName: null,
      labelNames: ['a'],
      due: null,
      priority: null,
    });
    expect(filterDefaults(node('#Work & #Home'))).toMatchObject({ listName: null });
    expect(filterDefaults(node('tomorrow'))).toMatchObject({ due: 'tomorrow' });
  });
});
