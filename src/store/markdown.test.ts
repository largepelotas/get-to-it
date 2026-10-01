import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { DEFAULT_GROCERY_CATEGORIES } from '@/data/types';
import { docFromText } from '@/lib/richText';
import { createFolder } from './actions/folders';
import { createItem, setChecked, setItemNotes, setWontDo } from './actions/items';
import { createSection } from './actions/sections';
import { archiveList, createList, deleteList, moveListToFolder } from './actions/lists';
import { setNoteContent } from './actions/notes';
import { resetForTests, useData } from './data';
import { listToMarkdown, markdownFiles, safeFileName } from './markdown';

beforeEach(() => resetForTests(new MemoryRepository()));

const md = (listId: string) => {
  const { tables } = useData.getState();
  return listToMarkdown(tables, tables.lists[listId], DEFAULT_GROCERY_CATEGORIES);
};

describe('listToMarkdown', () => {
  it('writes a to-do list as a task list with subtasks, details and a Completed section', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    const a = createItem(list, {
      text: 'Pay *invoice*',
      dueDate: '2026-10-02',
      dueTime: '15:00',
      priority: 1,
      recurrence: { freq: 'weekly', interval: 1, mode: 'schedule' },
    })!;
    const sub = createItem(list, { text: 'Find the PDF', parentId: a })!;
    setChecked(sub, true);
    setItemNotes(a, 'Ask Sam first');
    const done = createItem(list, { text: 'Old task' })!;
    setChecked(done, true);
    expect(md(list)).toBe(
      [
        '# Work',
        '',
        '- [ ] Pay \\*invoice\\* (due 2026-10-02 15:00, Every Friday, P1)',
        '  Ask Sam first',
        '  - [x] Find the PDF',
        '',
        '## Completed',
        '',
        '- [x] Old task',
        '',
      ].join('\n'),
    );
  });

  it('strikes through tasks closed as won’t do', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    const a = createItem(list, { text: 'Skip it', dueDate: '2026-10-02' })!;
    const b = createItem(list, { text: 'Did it' })!;
    setWontDo(a);
    setChecked(b, true);
    expect(md(list)).toContain('- [x] ~~Skip it~~ (due 2026-10-02)');
    expect(md(list)).toContain('- [x] Did it\n');
  });

  it('writes a grocery list by category, with the cart last', () => {
    const list = createList({ type: 'grocery', title: 'Shop' });
    createItem(list, { text: 'Milk', quantity: '1 l', category: 'dairy' });
    createItem(list, { text: 'Lemons', quantity: '2', category: 'produce' });
    createItem(list, { text: 'Thing' });
    const bread = createItem(list, { text: 'Bread', category: 'bakery' })!;
    setChecked(bread, true);
    expect(md(list)).toBe(
      [
        '# Shop',
        '',
        '## Produce',
        '',
        '- [ ] Lemons (2)',
        '',
        '## Dairy & eggs',
        '',
        '- [ ] Milk (1 l)',
        '',
        '## Other',
        '',
        '- [ ] Thing',
        '',
        '## In cart',
        '',
        '- [x] Bread',
        '',
      ].join('\n'),
    );
  });

  it('writes a note with its title as the heading', () => {
    const list = createList({ type: 'note', title: 'Ideas' });
    setNoteContent(list, docFromText('One\nTwo'));
    expect(md(list)).toBe('# Ideas\n\nOne\n\nTwo\n');
  });

  it('writes just the title for an empty list', () => {
    expect(md(createList({ type: 'todo', title: 'Empty' }))).toBe('# Empty\n');
  });
});

describe('safeFileName', () => {
  it('replaces characters files can’t have and avoids reserved names', () => {
    expect(safeFileName('Q3: plan / review?')).toBe('Q3- plan - review-');
    expect(safeFileName('  ..hidden.  ')).toBe('hidden');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('   ')).toBe('Untitled');
  });
});

describe('markdownFiles', () => {
  it('puts lists in folders and archived lists under Archive, numbering clashes', () => {
    const folder = createFolder('Work');
    const a = createList({ type: 'todo', title: 'Plan' });
    moveListToFolder(a, folder);
    createList({ type: 'todo', title: 'Plan' });
    createList({ type: 'note', title: 'plan' });
    const old = createList({ type: 'todo', title: 'Old' });
    archiveList(old);
    const gone = createList({ type: 'todo', title: 'Gone' });
    deleteList(gone);
    const { tables } = useData.getState();
    const files = markdownFiles(tables, DEFAULT_GROCERY_CATEGORIES);
    expect(files.map((f) => f.path).sort()).toEqual([
      'Archive/Old.md',
      'Plan.md',
      'Work/Plan.md',
      'plan 2.md',
    ]);
    expect(files.find((f) => f.path === 'Work/Plan.md')?.contents).toBe('# Plan\n');
  });
});

describe('listToMarkdown with sections', () => {
  // Bug prevented: sections losing their tasks in an export, or changing a list that has none.
  it('writes unsectioned tasks first, then each section as a heading under the title', () => {
    const list = createList({ type: 'todo', title: 'Home' });
    const kitchen = createSection(list, 'Kitchen')!;
    const garden = createSection(list, 'Garden')!;
    createSection(list, 'Empty');
    createItem(list, { text: 'Water plants', sectionId: garden });
    const paint = createItem(list, { text: 'Paint', sectionId: kitchen })!;
    createItem(list, { text: 'Prime walls', parentId: paint });
    createItem(list, { text: 'Loose' });
    const done = createItem(list, { text: 'Old', sectionId: kitchen })!;
    setChecked(done, true);
    expect(md(list)).toBe(
      [
        '# Home',
        '',
        '- [ ] Loose',
        '',
        '## Kitchen',
        '',
        '- [ ] Paint',
        '  - [ ] Prime walls',
        '',
        '## Garden',
        '',
        '- [ ] Water plants',
        '',
        '## Empty',
        '',
        '## Completed',
        '',
        '- [x] Old',
        '',
      ].join('\n'),
    );
  });

  it('writes a list with no sections exactly as before', () => {
    const list = createList({ type: 'todo', title: 'Plain' });
    createItem(list, { text: 'One' });
    expect(md(list)).toBe('# Plain\n\n- [ ] One\n');
  });
});

describe('listToMarkdown with deadlines', () => {
  // Bug prevented: an end time or deadline being lost from the Markdown copy.
  it('writes a time range and a deadline', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    createItem(list, {
      text: 'Call',
      dueDate: '2026-10-03',
      dueTime: '14:00',
      endTime: '15:30',
      deadline: '2026-10-10',
    });
    createItem(list, { text: 'Only deadline', deadline: '2026-10-11' });
    expect(md(list)).toBe(
      [
        '# Work',
        '',
        '- [ ] Call (due 2026-10-03 14:00–15:30, deadline 2026-10-10)',
        '- [ ] Only deadline (deadline 2026-10-11)',
        '',
      ].join('\n'),
    );
  });
});
