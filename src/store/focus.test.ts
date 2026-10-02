import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import type { FocusSession } from '@/data/types';
import { createItem, setChecked } from './actions/items';
import { createList } from './actions/lists';
import { resetForTests, useData } from './data';
import {
  finishTimer,
  focusSeconds,
  itemSessions,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  stopTimerForItems,
  stopTimerUnder,
  useFocus,
} from './focus';

const T0 = new Date(2026, 9, 5, 12, 0).getTime();
const SEC = 1000;
let list: string;
let task: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  resetForTests(new MemoryRepository());
  useFocus.setState({ timer: null });
  list = createList({ type: 'todo', title: 'Tasks' });
  task = createItem(list, { text: 'Write plan' })!;
});

afterEach(() => vi.useRealTimers());

const sessions = () => Object.values(useData.getState().tables.focusSessions);
const timer = () => useFocus.getState().timer;

describe('startTimer', () => {
  // Bug prevented: a timer on a done or missing task, which could never be logged properly.
  it('refuses a checked task and a missing task, and starts on a live one', () => {
    const done = createItem(list, { text: 'Done' })!;
    setChecked(done, true);
    expect(startTimer('stopwatch', done, null, T0)).toBe(false);
    expect(startTimer('pomodoro', 'nope', 25, T0)).toBe(false);
    expect(timer()).toBeNull();
    expect(startTimer('pomodoro', task, 25, T0)).toBe(true);
    expect(timer()).toMatchObject({ kind: 'pomodoro', itemId: task, minutes: 25, startedAt: T0 });
  });

  // Bug prevented: two timers running at once, or the first one's time being thrown away.
  it('logs the running timer and replaces it', () => {
    const other = createItem(list, { text: 'Other' })!;
    startTimer('stopwatch', task, null, T0);
    startTimer('stopwatch', other, null, T0 + 90 * SEC);
    expect(sessions()).toHaveLength(1);
    expect(sessions()[0]).toMatchObject({ itemId: task, seconds: 90 });
    expect(timer()?.itemId).toBe(other);
  });

  // Bug prevented: a break needing a task, or being refused for having none.
  it('starts a break without a task', () => {
    expect(startTimer('break', null, 5, T0)).toBe(true);
    expect(timer()).toMatchObject({ kind: 'break', itemId: null, minutes: 5 });
  });
});

describe('pause and resume', () => {
  // Bug prevented: paused time being logged as focus.
  it('stops the clock while paused and leaves the pause out of the log', () => {
    startTimer('stopwatch', task, null, T0);
    pauseTimer(T0 + 60 * SEC);
    pauseTimer(T0 + 100 * SEC); // already paused: no-op
    expect(timer()?.pausedAt).toBe(T0 + 60 * SEC);
    resumeTimer(T0 + 160 * SEC);
    resumeTimer(T0 + 170 * SEC); // not paused: no-op
    expect(timer()).toMatchObject({ pausedAt: null, pausedMs: 100 * SEC });
    const result = stopTimer(T0 + 190 * SEC);
    expect(result?.session?.seconds).toBe(90);
  });
});

describe('stopTimer', () => {
  // Bug prevented: accidental starts cluttering the log; also the timer sticking after a stop.
  it('logs nothing under a minute and 90 seconds after 90', () => {
    startTimer('stopwatch', task, null, T0);
    const short = stopTimer(T0 + 30 * SEC);
    expect(short?.session).toBeNull();
    expect(sessions()).toHaveLength(0);
    expect(timer()).toBeNull();

    startTimer('stopwatch', task, null, T0);
    const result = stopTimer(T0 + 90 * SEC);
    const row: FocusSession = {
      id: result!.timer.id,
      itemId: task,
      kind: 'stopwatch',
      startedAt: T0,
      endedAt: T0 + 90 * SEC,
      seconds: 90,
    };
    expect(result?.session).toEqual(row);
    expect(useData.getState().tables.focusSessions[row.id]).toEqual(row);
    expect(timer()).toBeNull();
  });

  it('returns null when nothing is running', () => {
    expect(stopTimer(T0)).toBeNull();
  });

  // Bug prevented: a session for a purged task (an orphan row) when the timer stops.
  it('logs nothing when the task has been purged', () => {
    startTimer('stopwatch', task, null, T0);
    useData.setState((s) => {
      const { [task]: _gone, ...items } = s.tables.items;
      return { tables: { ...s.tables, items } };
    });
    expect(stopTimer(T0 + 120 * SEC)?.session).toBeNull();
    expect(sessions()).toHaveLength(0);
  });

  // Bug prevented: time on a deleted-but-recoverable task being thrown away.
  it('logs for a task that is in the Trash', () => {
    startTimer('stopwatch', task, null, T0);
    useData.setState((s) => ({
      tables: {
        ...s.tables,
        items: { ...s.tables.items, [task]: { ...s.tables.items[task], deletedAt: 5 } },
      },
    }));
    expect(stopTimer(T0 + 120 * SEC)?.session?.seconds).toBe(120);
  });
});

describe('finishTimer', () => {
  // Bug prevented: finishing early ending the timer, or a late finish logging the overshoot.
  it('does nothing before zero and logs the planned length at zero', () => {
    startTimer('pomodoro', task, 25, T0);
    expect(finishTimer(T0 + 24 * 60 * SEC)).toBeNull();
    expect(timer()).not.toBeNull();
    const result = finishTimer(T0 + 26 * 60 * SEC);
    expect(result?.session).toMatchObject({ seconds: 1500, kind: 'pomodoro', itemId: task });
    expect(timer()).toBeNull();
    expect(sessions()).toHaveLength(1);
  });

  // Bug prevented: breaks showing up as focused time.
  it('finishes a break without a row', () => {
    startTimer('break', null, 5, T0);
    const result = finishTimer(T0 + 5 * 60 * SEC);
    expect(result?.session).toBeNull();
    expect(result?.timer.kind).toBe('break');
    expect(timer()).toBeNull();
    expect(sessions()).toHaveLength(0);
  });
});

describe('stopTimerForItems', () => {
  // Bug prevented: completing one task stopping the timer running on another.
  it('ignores other ids and stops on a match', () => {
    startTimer('stopwatch', task, null, T0);
    expect(stopTimerForItems(['other'], T0 + 120 * SEC)).toBeNull();
    expect(timer()).not.toBeNull();
    expect(stopTimerForItems(['other', task], T0 + 120 * SEC)?.session?.seconds).toBe(120);
    expect(timer()).toBeNull();
  });
});

describe('stopTimerUnder', () => {
  // Bug prevented: trashing a parent leaving a timer on its subtask running, logging time on a deleted task.
  it('stops a timer on a descendant of the given task, not on a sibling', () => {
    const child = createItem(list, { text: 'Child', parentId: task })!;
    const grandchild = createItem(list, { text: 'Grandchild', parentId: child })!;
    const sibling = createItem(list, { text: 'Sibling' })!;
    const items = () => useData.getState().tables.items;
    startTimer('stopwatch', grandchild, null, T0);
    expect(stopTimerUnder([sibling], items(), T0 + 120 * SEC)).toBeNull();
    expect(timer()).not.toBeNull();
    expect(stopTimerUnder([task], items(), T0 + 120 * SEC)?.session?.seconds).toBe(120);
    expect(timer()).toBeNull();
  });
});

describe('selectors', () => {
  const row = (id: string, itemId: string, endedAt: number, seconds: number): FocusSession => ({
    id,
    itemId,
    kind: 'pomodoro',
    startedAt: 0,
    endedAt,
    seconds,
  });
  const table = {
    a: row('a', 'x', 10, 100),
    b: row('b', 'x', 30, 200),
    c: row('c', 'y', 20, 999),
  };

  // Bug prevented: the newest session not leading the list.
  it('lists a task’s sessions newest first and sums them', () => {
    expect(itemSessions(table, 'x').map((s) => s.id)).toEqual(['b', 'a']);
    expect(focusSeconds(table, 'x')).toBe(300);
    expect(focusSeconds(table, 'none')).toBe(0);
  });
});

describe('undo history', () => {
  // Bug prevented: Undo stepping back over a focus log, a step the user never took.
  it('does not add an undo step', () => {
    startTimer('stopwatch', task, null, T0);
    const past = useData.getState().past;
    stopTimer(T0 + 120 * SEC);
    expect(sessions()).toHaveLength(1);
    expect(useData.getState().past).toBe(past);
  });
});
