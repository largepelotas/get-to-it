import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { createItem } from './actions/items';
import { createList } from './actions/lists';
import {
  monthGrid,
  monthTitle,
  rangeTitle,
  rowsByDay,
  unscheduledRows,
  unscheduledSections,
} from './calendar';
import { resetForTests, useData } from './data';
import { dueRows } from './smart';

describe('monthGrid', () => {
  // Bug prevented: the grid starting on the wrong weekday, or missing the month's last days.
  it('runs from the week with the 1st to the week with the last day', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const monday = monthGrid('2026-10-15', 1);
    expect(monday).toHaveLength(5);
    expect(monday.every((week) => week.length === 7)).toBe(true);
    expect(monday[0][0]).toBe('2026-09-28');
    expect(monday[0][3]).toBe('2026-10-01');
    expect(monday[4][6]).toBe('2026-11-01');
    const sunday = monthGrid('2026-10-15', 0);
    expect(sunday[0][0]).toBe('2026-09-27');
    expect(sunday[sunday.length - 1][6]).toBe('2026-10-31');
  });

  it('has six rows when the month needs them and four for a short February', () => {
    // August 2026 starts on a Saturday and ends on a Monday.
    expect(monthGrid('2026-08-01', 1)).toHaveLength(6);
    // February 2027 starts on a Monday and has 28 days.
    expect(monthGrid('2027-02-10', 1)).toHaveLength(4);
  });
});

describe('titles', () => {
  it('names the month', () => {
    expect(monthTitle('2026-10-02')).toBe('October 2026');
  });

  // Bug prevented: a range header repeating the month or dropping the year across New Year.
  it('names a range of days', () => {
    expect(
      rangeTitle([
        '2026-09-28',
        '2026-09-29',
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
      ]),
    ).toBe('Sep 28 – Oct 4, 2026');
    expect(rangeTitle(['2026-10-02', '2026-10-03', '2026-10-04'])).toBe('Oct 2 – 4, 2026');
    expect(rangeTitle(['2026-12-30', '2026-12-31', '2027-01-01'])).toBe(
      'Dec 30, 2026 – Jan 1, 2027',
    );
  });
});

describe('rows', () => {
  it('groups rows by day, keeping their order', () => {
    resetForTests(new MemoryRepository());
    const list = createList({ type: 'todo', title: 'Work' });
    createItem(list, { text: 'Late', dueDate: '2026-10-02', dueTime: '15:00' });
    createItem(list, { text: 'Early', dueDate: '2026-10-02', dueTime: '08:00' });
    createItem(list, { text: 'Other day', dueDate: '2026-10-03' });
    const { items, lists } = useData.getState().tables;
    const byDay = rowsByDay(dueRows(items, lists));
    expect(byDay.get('2026-10-02')?.map((r) => r.item.text)).toEqual(['Early', 'Late']);
    expect(byDay.get('2026-10-03')?.map((r) => r.item.text)).toEqual(['Other day']);
    expect(byDay.get('2026-10-04')).toBeUndefined();
  });

  // Bug prevented: dated, done, trashed or archived-list tasks turning up as "unscheduled".
  it('lists open undated tasks by list then position, grouped in sidebar order', () => {
    resetForTests(new MemoryRepository());
    const work = createList({ type: 'todo', title: 'Work' });
    const home = createList({ type: 'todo', title: 'Home' });
    createList({ type: 'todo', title: 'Empty' });
    const notes = createList({ type: 'note', title: 'Notes' });
    createItem(home, { text: 'H1' });
    createItem(work, { text: 'W1' });
    createItem(work, { text: 'W2' });
    createItem(work, { text: 'Dated', dueDate: '2026-10-02' });
    createItem(notes, { text: 'Note line' });
    const { items, lists } = useData.getState().tables;
    const rows = unscheduledRows(items, lists);
    expect(rows.map((r) => r.item.text).sort()).toEqual(['H1', 'W1', 'W2']);
    const sections = unscheduledSections(rows, Object.values(lists));
    expect(sections.map((s) => s.list.title)).toEqual(['Work', 'Home']);
    expect(sections[0].rows.map((r) => r.item.text)).toEqual(['W1', 'W2']);
  });
});
