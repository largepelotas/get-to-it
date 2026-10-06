import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { createItem } from './actions/items';
import { createList } from './actions/lists';
import {
  allDayEntries,
  allDayRows,
  entriesByDay,
  MIN_BLOCK_MINUTES,
  monthGrid,
  monthTitle,
  rangeTitle,
  rowsByDay,
  slotFromOffset,
  timedBlocks,
  timedEntryBlocks,
  unscheduledRows,
  unscheduledSections,
} from './calendar';
import { resetForTests, useData } from './data';
import { dueRows } from './smart';
import type { FeedEvent } from './feeds';

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

describe('timedBlocks', () => {
  const blocksOf = (specs: { text: string; dueTime?: string; endTime?: string }[]) => {
    resetForTests(new MemoryRepository());
    const list = createList({ type: 'todo', title: 'Tasks' });
    for (const s of specs) createItem(list, { dueDate: '2026-10-02', ...s });
    return timedBlocks(dueRows(useData.getState().tables.items, useData.getState().tables.lists));
  };
  const shape = (b: ReturnType<typeof blocksOf>) =>
    b.map((x) => `${x.row.item.text}:${x.start}-${x.end}:${x.lane}/${x.lanes}`);

  // Bug prevented: a lone task being squeezed into a partial-width column.
  it('puts a block with no neighbours in lane 0 of 1', () => {
    expect(shape(blocksOf([{ text: 'A', dueTime: '09:00', endTime: '10:00' }]))).toEqual([
      'A:540-600:0/1',
    ]);
  });

  // Bug prevented: overlapping blocks drawn on top of each other.
  it('splits two overlapping blocks into two lanes', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '09:00', endTime: '10:00' },
      { text: 'B', dueTime: '09:30', endTime: '10:30' },
    ]);
    expect(shape(b)).toEqual(['A:540-600:0/2', 'B:570-630:1/2']);
  });

  // Bug prevented: a block reusing the wrong lane, or a cluster's width differing between its blocks.
  it('reuses the first free lane and shares the cluster width', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '09:00', endTime: '10:00' },
      { text: 'B', dueTime: '09:30', endTime: '11:00' },
      { text: 'C', dueTime: '10:00', endTime: '10:45' },
    ]);
    expect(shape(b)).toEqual(['A:540-600:0/2', 'B:570-660:1/2', 'C:600-645:0/2']);
  });

  // Bug prevented: back-to-back tasks counted as overlapping and drawn half width.
  it('does not count a block ending exactly when the next starts as overlapping', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '09:00', endTime: '10:00' },
      { text: 'B', dueTime: '10:00', endTime: '11:00' },
    ]);
    expect(shape(b)).toEqual(['A:540-600:0/1', 'B:600-660:0/1']);
  });

  // Bug prevented: a task with no end being drawn with no height, or clusters merging across a gap.
  it('gives a task with no end 30 minutes and ignores untimed tasks', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '09:00' },
      { text: 'B', dueTime: '09:30' },
      { text: 'Untimed' },
    ]);
    expect(shape(b)).toEqual(['A:540-570:0/1', 'B:570-600:0/1']);
  });

  // Bug prevented: two 15-minute entries back to back drawn on top of each other, because each
  // is drawn at least MIN_BLOCK_MINUTES tall and so really overlaps the next.
  it('gives short back-to-back blocks their own lanes, keeping their real times', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '10:00', endTime: '10:15' },
      { text: 'B', dueTime: '10:15', endTime: '10:30' },
    ]);
    expect(MIN_BLOCK_MINUTES).toBe(25);
    expect(shape(b)).toEqual(['A:600-615:0/2', 'B:615-630:1/2']);
  });

  // Bug prevented: the minimum height making 30-minute back-to-back blocks share space they do not need.
  it('keeps 30-minute back-to-back blocks in one lane', () => {
    const b = blocksOf([
      { text: 'A', dueTime: '10:00', endTime: '10:30' },
      { text: 'B', dueTime: '10:30', endTime: '11:00' },
    ]);
    expect(shape(b)).toEqual(['A:600-630:0/1', 'B:630-660:0/1']);
  });
});

describe('allDayRows', () => {
  // Bug prevented: timed tasks showing in the all-day row as well as the grid.
  it('keeps only the rows without a time', () => {
    resetForTests(new MemoryRepository());
    const list = createList({ type: 'todo', title: 'Tasks' });
    createItem(list, { text: 'Timed', dueDate: '2026-10-02', dueTime: '09:00' });
    createItem(list, { text: 'Plain', dueDate: '2026-10-02' });
    const rows = dueRows(useData.getState().tables.items, useData.getState().tables.lists);
    expect(allDayRows(rows).map((r) => r.item.text)).toEqual(['Plain']);
  });
});

describe('slotFromOffset', () => {
  // Bug prevented: drops landing on the wrong time because of the wrong scale or rounding up.
  it('rounds down to a quarter hour', () => {
    expect(slotFromOffset(0, 48)).toBe(0);
    expect(slotFromOffset(480, 48)).toBe(600);
    expect(slotFromOffset(487, 48)).toBe(600);
    expect(slotFromOffset(492, 48)).toBe(615);
  });

  // Bug prevented: a drop above or below the grid producing a negative or next-day time.
  it('clamps to 00:00 through 23:45', () => {
    expect(slotFromOffset(-30, 48)).toBe(0);
    expect(slotFromOffset(5000, 48)).toBe(1425);
  });
});

describe('events on the calendar', () => {
  const event = (title: string, startTime: string | null, endTime: string | null): FeedEvent => ({
    id: title,
    title,
    date: '2026-10-02',
    startTime,
    endTime,
    location: null,
    feedId: 'F',
    feedName: 'Feed',
  });
  const setup = (events: FeedEvent[]) => {
    resetForTests(new MemoryRepository());
    const list = createList({ type: 'todo', title: 'Tasks' });
    createItem(list, { text: 'Task', dueDate: '2026-10-02', dueTime: '09:00', endTime: '10:00' });
    createItem(list, { text: 'Plain', dueDate: '2026-10-02' });
    const rows = dueRows(useData.getState().tables.items, useData.getState().tables.lists);
    return entriesByDay(rows, new Map([['2026-10-02', events]])).get('2026-10-02')!;
  };
  const name = (e: ReturnType<typeof setup>[number]) =>
    e.kind === 'task' ? e.row.item.text : e.event.title;

  // Bug prevented: an event drawn on top of a task that runs at the same time.
  it('shares lanes between a timed event and an overlapping task', () => {
    const blocks = timedEntryBlocks(setup([event('Meeting', '09:30', '10:30')]));
    expect(blocks.map((b) => `${name(b.value)}:${b.start}-${b.end}:${b.lane}/${b.lanes}`)).toEqual([
      'Task:540-600:0/2',
      'Meeting:570-630:1/2',
    ]);
  });

  // Bug prevented: an event with no end getting no height, or a different default from a task.
  it('gives an event with no end 30 minutes', () => {
    const blocks = timedEntryBlocks(setup([event('Call', '14:00', null)]));
    expect(blocks.find((b) => name(b.value) === 'Call')).toMatchObject({ start: 840, end: 870 });
  });

  // Bug prevented: all-day events in the time grid, or timed ones in the all-day row.
  it('puts all-day events in the all-day row, and lists all-day entries before timed ones', () => {
    const entries = setup([event('Holiday', null, null), event('Meeting', '09:30', '10:30')]);
    expect(entries.map(name)).toEqual(['Holiday', 'Plain', 'Task', 'Meeting']);
    expect(allDayEntries(entries).map(name)).toEqual(['Holiday', 'Plain']);
  });

  // Bug prevented: a day's events all listed before its tasks, whatever their times.
  it('mixes timed events and tasks by start time', () => {
    const entries = setup([event('Late', '15:00', null), event('Early', '08:00', null)]);
    expect(entries.map(name)).toEqual(['Plain', 'Early', 'Task', 'Late']);
  });

  // Bug prevented: a task listed ahead of an event starting at the same time.
  it('puts an event before a task on the same start time, and keeps arrival order otherwise', () => {
    const entries = setup([event('Same', '09:00', null), event('Same2', '09:00', null)]);
    expect(entries.map(name)).toEqual(['Plain', 'Same', 'Same2', 'Task']);
  });

  // Bug prevented: sorting scrambling a day whose entries have no time.
  it('keeps the rows order on a day with only untimed tasks', () => {
    resetForTests(new MemoryRepository());
    const list = createList({ type: 'todo', title: 'Tasks' });
    createItem(list, { text: 'One', dueDate: '2026-10-02' });
    createItem(list, { text: 'Two', dueDate: '2026-10-02' });
    createItem(list, { text: 'Three', dueDate: '2026-10-02' });
    const rows = dueRows(useData.getState().tables.items, useData.getState().tables.lists);
    const expected = rows.map((r) => r.item.text);
    const entries = entriesByDay(rows, new Map()).get('2026-10-02')!;
    expect(entries.map(name)).toEqual(expected);
  });
});
