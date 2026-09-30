import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Priority } from '@/data/types';
import { archiveList, createList } from './actions/lists';
import { createItem, setChecked } from './actions/items';
import { resetForTests, useData } from './data';
import { dueRows, todayCount, todayModel, upcomingModel } from './smart';

let work: string;
let home: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  work = createList({ type: 'todo', title: 'Work' });
  home = createList({ type: 'todo', title: 'Home' });
});

const add = (
  listId: string,
  text: string,
  dueDate: string | null,
  extra: { dueTime?: string; priority?: Priority; parentId?: string } = {},
) => createItem(listId, { text, dueDate, ...extra })!;

const rows = () => {
  const { items, lists } = useData.getState().tables;
  return dueRows(items, lists);
};
const texts = (r: { item: { text: string } }[]) => r.map((x) => x.item.text);

describe('dueRows', () => {
  it('takes open, dated tasks from live to-do lists only', () => {
    add(work, 'Dated', '2026-10-01');
    add(work, 'Undated', null);
    const done = add(work, 'Done', '2026-10-01');
    setChecked(done, true);
    const archived = createList({ type: 'todo', title: 'Old' });
    add(archived, 'Archived', '2026-10-01');
    archiveList(archived);
    expect(texts(rows())).toEqual(['Dated']);
  });

  it('sorts by date, timed tasks first, then priority', () => {
    add(work, 'Later day', '2026-10-02');
    add(work, 'Plain', '2026-10-01');
    add(home, 'P2', '2026-10-01', { priority: 2 });
    add(work, 'At 9', '2026-10-01', { dueTime: '09:00' });
    add(home, 'At 8', '2026-10-01', { dueTime: '08:00' });
    add(work, 'P1', '2026-10-01', { priority: 1 });
    expect(texts(rows())).toEqual(['At 8', 'At 9', 'P1', 'P2', 'Plain', 'Later day']);
  });

  it('lists subtasks on their own with their parent, and counts subtasks', () => {
    const parent = add(work, 'Launch', '2026-10-01');
    add(work, 'Write post', '2026-10-01', { parentId: parent });
    add(work, 'Undated step', null, { parentId: parent });
    const r = rows();
    expect(texts(r)).toEqual(['Launch', 'Write post']);
    expect(r[0]).toMatchObject({ childCount: 2, doneCount: 0, parent: null });
    expect(r[1].parent?.text).toBe('Launch');
    expect(r[1].list.title).toBe('Work');
  });
});

describe('Today and Upcoming', () => {
  it('splits overdue, today and later days', () => {
    add(work, 'Old', '2026-09-28');
    add(work, 'Now', '2026-09-30');
    add(home, 'Tomorrow A', '2026-10-01');
    add(work, 'Tomorrow B', '2026-10-01');
    add(work, 'Next week', '2026-10-07');
    const today = '2026-09-30';
    const t = todayModel(rows(), today);
    expect(texts(t.overdue)).toEqual(['Old']);
    expect(texts(t.today)).toEqual(['Now']);
    expect(todayCount(rows(), today)).toBe(2);
    const groups = upcomingModel(rows(), today);
    expect(groups.map((g) => [g.date, texts(g.rows)])).toEqual([
      ['2026-10-01', ['Tomorrow B', 'Tomorrow A']],
      ['2026-10-07', ['Next week']],
    ]);
  });
});
