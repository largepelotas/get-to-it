import { describe, expect, it } from 'vitest';
import { parseQuickAdd, splitLines } from './quickAdd';

// Wednesday 30 September 2026, 10:00 local time.
const NOW = new Date(2026, 8, 30, 10, 0);

describe('parseQuickAdd', () => {
  it('leaves plain text alone', () => {
    const r = parseQuickAdd('Buy 2 apples', NOW);
    expect(r).toMatchObject({ text: 'Buy 2 apples', dueDate: null, dueTime: null, priority: 0 });
    expect(r.chips).toEqual([]);
  });

  it('reads a date and time', () => {
    const r = parseQuickAdd('Review deck tomorrow 3pm', NOW);
    expect(r).toMatchObject({ text: 'Review deck', dueDate: '2026-10-01', dueTime: '15:00' });
    expect(r.chips).toHaveLength(1);
  });

  it('drops a leftover preposition', () => {
    expect(parseQuickAdd('Pay invoice by Friday', NOW)).toMatchObject({
      text: 'Pay invoice',
      dueDate: '2026-10-02',
      dueTime: null,
    });
  });

  it('ignores a bare month', () => {
    expect(parseQuickAdd('Meeting notes for March', NOW).dueDate).toBeNull();
  });

  it('treats a small bare hour as the afternoon', () => {
    expect(parseQuickAdd('Call Sam at 5', NOW)).toMatchObject({
      text: 'Call Sam',
      dueDate: '2026-09-30',
      dueTime: '17:00',
    });
  });

  it('reads priority', () => {
    expect(parseQuickAdd('Fix the build p1', NOW)).toMatchObject({
      text: 'Fix the build',
      priority: 1,
    });
    expect(parseQuickAdd('Tidy desk !', NOW).priority).toBe(3);
    expect(parseQuickAdd('Ship it !!!', NOW).priority).toBe(1);
    expect(parseQuickAdd('Upgrade p10 cluster', NOW).priority).toBe(0);
  });

  it('reads weekday repeats with a time', () => {
    const r = parseQuickAdd('Standup every weekday 9:30', NOW);
    expect(r).toMatchObject({
      text: 'Standup',
      dueDate: '2026-10-01', // 9:30 today has passed, so tomorrow
      dueTime: '09:30',
      recurrence: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], mode: 'schedule' },
    });
    expect(r.chips).toContain('Every weekday');
  });

  it('reads named weekdays', () => {
    const r = parseQuickAdd('Team sync every mon and thu', NOW);
    expect(r).toMatchObject({
      text: 'Team sync',
      dueDate: '2026-10-01',
      recurrence: { freq: 'weekly', weekdays: [1, 4] },
    });
  });

  it('reads intervals and after-completion rules', () => {
    expect(parseQuickAdd('Water plants every 3 days after completion', NOW)).toMatchObject({
      text: 'Water plants',
      dueDate: '2026-09-30',
      recurrence: { freq: 'daily', interval: 3, mode: 'completion' },
    });
    expect(parseQuickAdd('Payroll every other week', NOW).recurrence).toMatchObject({
      freq: 'weekly',
      interval: 2,
    });
    expect(parseQuickAdd('Rent monthly', NOW).recurrence).toMatchObject({ freq: 'monthly' });
  });

  it('keeps the words when nothing else is left', () => {
    expect(parseQuickAdd('tomorrow', NOW)).toMatchObject({
      text: 'tomorrow',
      dueDate: '2026-10-01',
    });
  });
});

const LISTS = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'work', title: 'Work' },
  { id: 'ws', title: 'Work stuff' },
];

describe('parseQuickAdd #List', () => {
  // Bug: "#Work call Sam" stayed in the title and the task never reached Work.
  it('files the task in the matching list and shows a chip', () => {
    const r = parseQuickAdd('Call Sam #Work', NOW, { lists: LISTS });
    expect(r).toMatchObject({ text: 'Call Sam', listId: 'work' });
    expect(r.chips).toContain('#Work');
  });

  // Bug: "#Work stuff" filed into "Work" and left "stuff" in the title.
  it('prefers the longest title and allows spaces in titles', () => {
    expect(parseQuickAdd('#Work stuff Call Sam', NOW, { lists: LISTS })).toMatchObject({
      text: 'Call Sam',
      listId: 'ws',
    });
  });

  it('ignores case, and matches mid-sentence', () => {
    expect(parseQuickAdd('Call #work Sam', NOW, { lists: LISTS })).toMatchObject({
      text: 'Call Sam',
      listId: 'work',
    });
  });

  // Bug: a hashtag that is not a list must stay in the title.
  it('leaves an unknown #word and a partial-word match alone', () => {
    expect(parseQuickAdd('Fix #bug', NOW, { lists: LISTS })).toMatchObject({
      text: 'Fix #bug',
      listId: null,
    });
    expect(parseQuickAdd('Fix #Workaround', NOW, { lists: LISTS })).toMatchObject({
      text: 'Fix #Workaround',
      listId: null,
    });
    expect(parseQuickAdd('Fix a#Work', NOW, { lists: LISTS }).listId).toBeNull();
  });

  it('does nothing without lists', () => {
    expect(parseQuickAdd('Call Sam #Work', NOW)).toMatchObject({
      text: 'Call Sam #Work',
      listId: null,
    });
  });
});

describe('parseQuickAdd ! reminders', () => {
  const rel = (input: string) => parseQuickAdd(input, NOW, { defaultDue: '2026-10-01' });

  it('reads relative forms', () => {
    expect(rel('Call Sam !30min')).toMatchObject({
      text: 'Call Sam',
      reminder: { kind: 'relative', offsetMinutes: 30 },
    });
    expect(rel('Call Sam !30 min before').reminder).toEqual({
      kind: 'relative',
      offsetMinutes: 30,
    });
    expect(rel('Call Sam !2h').reminder).toEqual({ kind: 'relative', offsetMinutes: 120 });
    expect(rel('Call Sam !1 day before').reminder).toEqual({
      kind: 'relative',
      offsetMinutes: 1440,
    });
    expect(rel('Call Sam !due').reminder).toEqual({ kind: 'relative', offsetMinutes: 0 });
  });

  it('shows chips', () => {
    expect(rel('A !30 min before').chips).toContain('Remind 30 min before');
    expect(rel('A !1h').chips).toContain('Remind 1 hr before');
    expect(rel('A !due').chips).toContain('Remind at due time');
  });

  // Bug: "!30 min before" was read as a due date of 30 minutes from now.
  it('does not read the reminder words as the due date', () => {
    const r = parseQuickAdd('Call Sam !30 min before', NOW);
    expect(r).toMatchObject({ text: 'Call Sam', dueDate: null });
  });

  it('hides a relative reminder chip when the task has no due date', () => {
    const r = parseQuickAdd('Call Sam !30min', NOW);
    expect(r.chips).toEqual([]);
    const dated = parseQuickAdd('Call Sam tomorrow 3pm !30min', NOW);
    expect(dated.chips).toContain('Remind 30 min before');
    expect(dated).toMatchObject({ dueDate: '2026-10-01', dueTime: '15:00' });
  });

  it('reads absolute forms', () => {
    const nine = parseQuickAdd('Call Sam !tomorrow 9am', NOW);
    expect(nine.text).toBe('Call Sam');
    expect(nine.dueDate).toBeNull();
    expect(nine.reminder).toEqual({ kind: 'absolute', at: new Date(2026, 9, 1, 9, 0).getTime() });
    expect(parseQuickAdd('Call Sam !9am', NOW).reminder).toEqual({
      kind: 'absolute',
      at: new Date(2026, 9, 1, 9, 0).getTime(), // 9am today has passed
    });
    expect(parseQuickAdd('Call Sam !fri 14:00', NOW).reminder).toEqual({
      kind: 'absolute',
      at: new Date(2026, 9, 2, 14, 0).getTime(),
    });
    // 1-6 without am/pm means the afternoon.
    expect(parseQuickAdd('Call Sam !tomorrow at 4', NOW).reminder).toEqual({
      kind: 'absolute',
      at: new Date(2026, 9, 1, 16, 0).getTime(),
    });
    expect(parseQuickAdd('Call Sam !tomorrow 9am', NOW).chips[0]).toMatch(/^Remind /);
  });

  it('leaves other ! text alone', () => {
    expect(parseQuickAdd('Wow!nice', NOW)).toMatchObject({ text: 'Wow!nice', reminder: null });
    expect(parseQuickAdd('Call Sam !soon', NOW)).toMatchObject({
      text: 'Call Sam !soon',
      reminder: null,
    });
  });

  // Bug: the new "!" reminder must not break "!" as priority.
  it('keeps !, !! and !!! as priority, alone or with a reminder', () => {
    expect(parseQuickAdd('Tidy desk !', NOW)).toMatchObject({ priority: 3, reminder: null });
    expect(parseQuickAdd('Tidy desk !!', NOW).priority).toBe(2);
    expect(parseQuickAdd('Ship it !!!', NOW)).toMatchObject({ priority: 1, reminder: null });
    const both = parseQuickAdd('Ship it ! tomorrow 3pm !30min', NOW);
    expect(both).toMatchObject({ text: 'Ship it', dueDate: '2026-10-01', dueTime: '15:00' });
    expect(both.reminder).toEqual({ kind: 'relative', offsetMinutes: 30 });
    expect(both.priority).toBe(3);
  });
});

describe('splitLines', () => {
  it('strips list markers and drops blank lines', () => {
    expect(
      splitLines('- one\n* two\n• three\n1. four\n2) five\n- [ ] six\n- [x] seven\n\n  eight  '),
    ).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']);
  });
});

describe('parseQuickAdd with a "!word" that is not a reminder', () => {
  // Bug: only the first "!x" was tried, so "!important" hid a later valid "!30m".
  it('keeps !important in the title and still finds a later reminder', () => {
    const r = parseQuickAdd('Hey !important call !30m', NOW, { defaultDue: '2026-10-01' });
    expect(r.text).toBe('Hey !important call');
    expect(r.reminder).toEqual({ kind: 'relative', offsetMinutes: 30 });
  });

  // Bug: "!tomorrow" lost "tomorrow" to the date step and left a stray "!".
  it('leaves !tomorrow with no time untouched, and reads no date from it', () => {
    expect(parseQuickAdd('Call !tomorrow', NOW)).toMatchObject({
      text: 'Call !tomorrow',
      dueDate: null,
      reminder: null,
    });
  });
});
