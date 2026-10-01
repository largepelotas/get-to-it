import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { DEFAULT_GROCERY_CATEGORIES } from '@/data/types';
import { createItem, setChecked } from './actions/items';
import { createLabel, deleteLabel } from './actions/labels';
import { createList } from './actions/lists';
import { resetForTests, useData } from './data';
import { listToMarkdown, markdownFiles } from './markdown';

beforeEach(() => resetForTests(new MemoryRepository()));

const md = (listId: string) => {
  const { tables } = useData.getState();
  return listToMarkdown(tables, tables.lists[listId], DEFAULT_GROCERY_CATEGORIES);
};

describe('Markdown with labels', () => {
  // Bug prevented: labels vanishing from "Copy as Markdown", or a labelled task changing for others.
  it('writes labels after the task text in label order, and leaves unlabelled tasks as before', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    const errands = createLabel('errands')!;
    const phone = createLabel('phone')!;
    const a = createItem(list, { text: 'Call the bank', labelIds: [phone, errands] })!;
    createItem(list, { text: 'Plain task' });
    createItem(list, { text: 'Sub', parentId: a, labelIds: [phone] });
    const done = createItem(list, { text: 'Done one', labelIds: [errands], priority: 1 })!;
    setChecked(done, true);
    expect(md(list)).toBe(
      [
        '# Work',
        '',
        '- [ ] Call the bank @errands @phone',
        '  - [ ] Sub @phone',
        '- [ ] Plain task',
        '',
        '## Completed',
        '',
        '- [x] Done one @errands (P1)',
        '',
      ].join('\n'),
    );
  });

  it('leaves out a label that was deleted, and writes a multi-word name whole', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    const gone = createLabel('gone')!;
    const deep = createLabel('deep work')!;
    createItem(list, { text: 'Task', labelIds: [gone, deep] });
    deleteLabel(gone);
    expect(md(list)).toBe('# Work\n\n- [ ] Task @deep work\n');
  });

  it('is used by the Markdown export too', () => {
    const list = createList({ type: 'todo', title: 'Work' });
    const l = createLabel('x')!;
    createItem(list, { text: 'Task', labelIds: [l] });
    const { tables } = useData.getState();
    const [file] = markdownFiles(tables, DEFAULT_GROCERY_CATEGORIES);
    expect(file.contents).toContain('- [ ] Task @x');
  });
});
