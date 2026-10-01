import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// Wednesday 30 September 2026, 10:00 local time.
const NOW = new Date(2026, 8, 30, 10, 0);

const labels = [
  { id: 'L1', name: 'Errands' },
  { id: 'L2', name: 'deep work' },
  { id: 'L3', name: 'deep' },
];
const parse = (text: string, extra = {}) => parseQuickAdd(text, NOW, { labels, ...extra });

describe('parseQuickAdd labels', () => {
  // Bug prevented: "@errands" staying in the title, or matching only the stored spelling.
  it('takes an existing label out of the title, in any case, and shows the stored spelling', () => {
    const r = parse('Buy stamps @errands');
    expect(r).toMatchObject({ text: 'Buy stamps', labelIds: ['L1'], newLabels: [] });
    expect(r.chips).toEqual(['@Errands']);
    expect(parse('@ERRANDS Buy stamps').text).toBe('Buy stamps');
  });

  // Bug prevented: "@deep work" matching the shorter "deep" and leaving "work" in the title.
  it('prefers the longest label name, and matches a multi-word name', () => {
    expect(parse('Think @deep work')).toMatchObject({ text: 'Think', labelIds: ['L2'] });
    expect(parse('Think @deep later')).toMatchObject({ text: 'Think later', labelIds: ['L3'] });
  });

  it('treats an unknown word as a new label, as typed, with a "(new)" chip', () => {
    const r = parse('Call bank @Phone');
    expect(r).toMatchObject({ text: 'Call bank', labelIds: [], newLabels: ['Phone'] });
    expect(r.chips).toEqual(['@Phone (new)']);
    expect(parse('x @my_label-2 y').newLabels).toEqual(['my_label-2']);
    expect(parse('x @café').newLabels).toEqual(['café']);
  });

  it('takes several labels, existing and new', () => {
    const r = parse('Plan @errands @phone @deep work');
    expect(r).toMatchObject({ text: 'Plan', labelIds: ['L1', 'L2'], newLabels: ['phone'] });
    expect(r.chips).toEqual(['@Errands', '@phone (new)', '@deep work']);
  });

  // Bug prevented: one label typed twice being added twice.
  it('counts the same label once, whatever its case', () => {
    expect(parse('a @errands b @Errands')).toMatchObject({ text: 'a b', labelIds: ['L1'] });
    const r = parse('a @fresh @FRESH');
    expect(r.newLabels).toEqual(['fresh']);
    expect(r.chips).toEqual(['@fresh (new)']);
  });

  it('works in any order with #List, /Section, a date and a reminder', () => {
    const lists = [{ id: 'LIST', title: 'Home' }];
    const sections = [{ id: 'S1', listId: 'LIST', title: 'Kitchen' }];
    const r = parse('@errands Fix tap #Home /Kitchen tomorrow 3pm !30min @new p1', {
      lists,
      sections,
    });
    expect(r).toMatchObject({
      text: 'Fix tap',
      listId: 'LIST',
      sectionId: 'S1',
      dueDate: '2026-10-01',
      dueTime: '15:00',
      priority: 1,
      labelIds: ['L1'],
      newLabels: ['new'],
    });
    expect(r.reminder).toEqual({ kind: 'relative', offsetMinutes: 30 });
    const r2 = parse('Fix tap @errands !30min tomorrow');
    expect(r2).toMatchObject({ text: 'Fix tap', labelIds: ['L1'], dueDate: '2026-10-01' });
  });

  // Bug prevented: emails and stray @ signs being eaten as labels.
  it.each([
    ['a lone @', 'Call @ later'],
    ['an @ before a space and a time', 'Meet @ 5pm'],
    ['@ and punctuation', 'Wow @!'],
    ['an @ inside a word', 'Mail bob@example.com please'],
    ['an @ with trailing punctuation', 'Go @home, then rest'],
    ['an @ with trailing punctuation on an existing label', 'Go @errands, then rest'],
    ['an @ at the end', 'Call me @'],
  ])('leaves %s as typed', (_what, input) => {
    const r = parse(input);
    expect(r.labelIds).toEqual([]);
    expect(r.newLabels).toEqual([]);
    expect(r.chips.filter((c) => c.startsWith('@'))).toEqual([]);
    expect(r.text).toContain(input.includes('5pm') ? 'Meet @' : input.replace(/\s+/g, ' ').trim());
  });

  it('never reads @ when no labels option is given', () => {
    const r = parseQuickAdd('Buy milk @errands', NOW);
    expect(r).toMatchObject({ text: 'Buy milk @errands', labelIds: [], newLabels: [] });
    const r2 = parseQuickAdd('Buy milk @errands', NOW, { labels: undefined });
    expect(r2.text).toBe('Buy milk @errands');
  });

  it('still reads new labels when there are no labels yet', () => {
    expect(parseQuickAdd('x @first', NOW, { labels: [] }).newLabels).toEqual(['first']);
  });

  it('keeps the original words as the title when the label is everything typed', () => {
    const r = parse('@errands');
    expect(r.labelIds).toEqual(['L1']);
    expect(r.text).toBe('@errands');
  });
});
