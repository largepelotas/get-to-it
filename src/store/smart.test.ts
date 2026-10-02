import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { Priority } from '@/data/types';
import { archiveList, createList } from './actions/lists';
import { createItem, setChecked, setEndTime } from './actions/items';
import { resetForTests, useData } from './data';
import {
  countByDay,
  dueRows,
  next7Count,
  next7Model,
  scheduledMinutes,
  todayCount,
  todayModel,
  tomorrowCount,
  tomorrowModel,
  upcomingModel,
} from './smart';

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
    const { overdue, days } = upcomingModel(rows(), today, today, 1);
    expect(texts(overdue)).toEqual(['Old']);
    // 30 Sep 2026 is a Wednesday: the week runs to Sunday 4 Oct, then later days with rows.
    expect(days.map((g) => [g.date, texts(g.rows)])).toEqual([
      ['2026-09-30', ['Now']],
      ['2026-10-01', ['Tomorrow B', 'Tomorrow A']],
      ['2026-10-02', []],
      ['2026-10-03', []],
      ['2026-10-04', []],
      ['2026-10-07', ['Next week']],
    ]);
  });
});

describe('Upcoming from a chosen day', () => {
  const today = '2026-09-30';

  // Bug prevented: overdue tasks showing under a later week, where they are not "coming up".
  it('shows overdue only when the view starts today', () => {
    add(work, 'Old', '2026-09-28');
    expect(texts(upcomingModel(rows(), today, today, 1).overdue)).toEqual(['Old']);
    expect(upcomingModel(rows(), today, '2026-10-05', 1).overdue).toEqual([]);
  });

  // Bug prevented: empty days dropping out of the strip's week.
  it('keeps the rest of the starting week when days are empty', () => {
    const { days } = upcomingModel(rows(), today, '2026-10-01', 1);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  // Bug prevented: tasks between today and the chosen day leaking into the view.
  it('leaves out days before the starting day', () => {
    add(work, 'Today', '2026-09-30');
    add(work, 'Skipped', '2026-10-02');
    add(work, 'Shown', '2026-10-06');
    const { days } = upcomingModel(rows(), today, '2026-10-05', 1);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(texts(days.flatMap((d) => d.rows))).toEqual(['Shown']);
  });

  // Bug prevented: a long run of empty days after the week filling the view.
  it('adds a day after the week only when it has tasks', () => {
    add(work, 'Far', '2026-10-20');
    const { days } = upcomingModel(rows(), today, today, 1);
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-20',
    ]);
  });

  // Bug prevented: ignoring the week-start setting, so a Sunday-first week ends a day early.
  it('ends the week on Saturday when weeks start on Sunday', () => {
    const { days } = upcomingModel(rows(), today, today, 0);
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('counts open tasks per due date', () => {
    add(work, 'A', '2026-10-01');
    add(home, 'B', '2026-10-01');
    add(work, 'C', '2026-10-02');
    expect(countByDay(rows())).toEqual(
      new Map([
        ['2026-10-01', 2],
        ['2026-10-02', 1],
      ]),
    );
  });
});

describe('Tomorrow', () => {
  const today = '2026-09-30';

  it('holds only tasks due tomorrow, in the same order as Today, and counts them', () => {
    add(work, 'Today', '2026-09-30');
    add(work, 'Old', '2026-09-28');
    add(work, 'Plain', '2026-10-01');
    add(home, 'At 8', '2026-10-01', { dueTime: '08:00' });
    add(work, 'Later', '2026-10-02');
    expect(texts(tomorrowModel(rows(), today))).toEqual(['At 8', 'Plain']);
    expect(tomorrowCount(rows(), today)).toBe(2);
  });
});

describe('Next 7 days', () => {
  const today = '2026-09-30';

  // Bug prevented: empty days dropping out, so the week isn't visible at a glance.
  it('always has seven days from today, empty ones included', () => {
    add(work, 'Now', '2026-09-30');
    add(work, 'Friday', '2026-10-03');
    const model = next7Model(rows(), today);
    expect(model.days.map((d) => d.date)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ]);
    expect(model.days.map((d) => texts(d.rows))).toEqual([['Now'], [], [], ['Friday'], [], [], []]);
  });

  it('keeps overdue tasks apart and leaves out day eight', () => {
    add(work, 'Old', '2026-09-28');
    add(work, 'Last day', '2026-10-06');
    add(work, 'Day eight', '2026-10-07');
    const model = next7Model(rows(), today);
    expect(texts(model.overdue)).toEqual(['Old']);
    expect(texts(model.days[6].rows)).toEqual(['Last day']);
    expect(model.days.flatMap((d) => texts(d.rows))).not.toContain('Day eight');
  });

  it('counts overdue plus the seven days', () => {
    add(work, 'Old', '2026-09-28');
    add(work, 'Now', '2026-09-30');
    add(work, 'Last day', '2026-10-06');
    add(work, 'Day eight', '2026-10-07');
    expect(next7Count(rows(), today)).toBe(3);
  });
});

describe('scheduledMinutes', () => {
  // Bug it prevents: Today's total counted tasks without a range, or the Overdue ones.
  it('sums end minus start over the rows that have both times', () => {
    const a = add(home, 'A', '2026-10-05', { dueTime: '09:00' });
    setEndTime(a, '10:30');
    const b = add(home, 'B', '2026-10-05', { dueTime: '14:00' });
    setEndTime(b, '14:45');
    add(home, 'No end', '2026-10-05', { dueTime: '16:00' });
    add(home, 'No time', '2026-10-05');
    expect(scheduledMinutes(rows())).toBe(135);
    expect(scheduledMinutes([])).toBe(0);
  });
});
