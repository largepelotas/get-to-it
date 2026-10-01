import { describe, expect, it } from 'vitest';
import { parseQuickAdd, splitLines } from './quickAdd';
import { formatDue } from './dates';

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

describe('parseQuickAdd /Section', () => {
  const SECTIONS = [
    { id: 'k', listId: 'home', title: 'Kitchen' },
    { id: 'ks', listId: 'home', title: 'Kitchen sink' },
    { id: 'gar', listId: 'home', title: 'Garden' },
    { id: 'wk', listId: 'work', title: 'Kitchen' },
    { id: 'plan', listId: 'work', title: 'Planning' },
  ];
  const opts = {
    lists: [...LISTS, { id: 'home', title: 'Home' }],
    sections: SECTIONS,
    listId: 'home',
  };

  // Bug prevented: "/Kitchen" staying in the title and the task never reaching its section.
  it('files the task in the section of the target list and shows a chip', () => {
    const r = parseQuickAdd('Buy paint /Kitchen', NOW, opts);
    expect(r).toMatchObject({ text: 'Buy paint', sectionId: 'k', listId: null });
    expect(r.chips).toContain('/Kitchen');
  });

  it('ignores case and matches mid-sentence', () => {
    expect(parseQuickAdd('Buy /garden seeds', NOW, opts)).toMatchObject({
      text: 'Buy seeds',
      sectionId: 'gar',
    });
  });

  it('prefers the longest title and allows spaces in titles', () => {
    expect(parseQuickAdd('/Kitchen sink Fix tap', NOW, opts)).toMatchObject({
      text: 'Fix tap',
      sectionId: 'ks',
    });
  });

  // Bug prevented: filing into a same-named section of a different list.
  it('only matches sections of the target list', () => {
    expect(parseQuickAdd('Plan it /Planning', NOW, opts)).toMatchObject({
      text: 'Plan it /Planning',
      sectionId: null,
    });
    expect(parseQuickAdd('Buy paint /Kitchen', NOW, { ...opts, listId: 'work' })).toMatchObject({
      sectionId: 'wk',
    });
  });

  it('uses the #List list, whether #List comes before or after', () => {
    for (const text of [
      'Plan it /Planning #Work',
      '#Work /Planning Plan it',
      'Plan it #Work /Planning',
    ]) {
      expect(parseQuickAdd(text, NOW, opts)).toMatchObject({
        text: 'Plan it',
        listId: 'work',
        sectionId: 'plan',
      });
    }
    expect(
      parseQuickAdd('Buy paint /Kitchen #Home', NOW, { ...opts, listId: 'work' }),
    ).toMatchObject({ text: 'Buy paint', sectionId: 'k' });
    expect(parseQuickAdd('#Home /Kitchen Buy paint', NOW, opts)).toMatchObject({
      text: 'Buy paint',
      sectionId: 'k',
    });
  });

  // Bug prevented: ordinary slashes being eaten from titles.
  it('leaves text as typed when nothing matches, and never reads other slashes as tokens', () => {
    const odd = [
      { id: 'o', listId: 'home', title: 'or' },
      { id: 'h', listId: 'home', title: '2' },
      { id: 'x', listId: 'home', title: '/' },
    ];
    for (const text of [
      'Fix /Roof',
      'Choose this and/or that',
      'Add 1/2 cup',
      'See http://x.com',
      'a / b',
      'Lone /',
    ]) {
      const r = parseQuickAdd(text, NOW, { sections: odd, listId: 'home' });
      expect(r).toMatchObject({ text, sectionId: null });
    }
  });

  it('does nothing without sections or a target list', () => {
    expect(parseQuickAdd('Buy paint /Kitchen', NOW)).toMatchObject({
      text: 'Buy paint /Kitchen',
      sectionId: null,
    });
    expect(parseQuickAdd('Buy paint /Kitchen', NOW, { sections: SECTIONS })).toMatchObject({
      sectionId: null,
    });
  });
});

describe('parseQuickAdd deadlines, ranges and durations', () => {
  const noDates = { dueDate: null, dueTime: null, endTime: null, deadline: null };

  // Bug prevented: {date} being read as the due date, or left in the title.
  it('reads {date} as a deadline and cuts it out', () => {
    const r = parseQuickAdd('Send report {fri}', NOW);
    expect(r).toMatchObject({ text: 'Send report', deadline: '2026-10-02', dueDate: null });
    expect(r.chips).toEqual(['Deadline Friday']);
  });

  // Bug prevented: the deadline swallowing the due date, or the other way round.
  it('reads a deadline and a due date together', () => {
    expect(parseQuickAdd('Send report {15 oct} tomorrow', NOW)).toMatchObject({
      text: 'Send report',
      deadline: '2026-10-15',
      dueDate: '2026-10-01',
    });
  });

  // Bug prevented: a time inside the braces becoming the due time.
  it('ignores a time inside the braces', () => {
    expect(parseQuickAdd('Send report {fri 5pm}', NOW)).toMatchObject({
      deadline: '2026-10-02',
      dueDate: null,
      dueTime: null,
    });
  });

  // Bug prevented: braces that are not a date being eaten from the title.
  it('leaves braces that do not read as a day in the title', () => {
    expect(parseQuickAdd('Notes {draft}', NOW)).toMatchObject({
      text: 'Notes {draft}',
      ...noDates,
    });
  });

  // Bug prevented: a second {…} being read too, or lost from the title.
  it('only reads the first {…}', () => {
    expect(parseQuickAdd('Plan {fri} {sat}', NOW)).toMatchObject({
      text: 'Plan {sat}',
      deadline: '2026-10-02',
    });
  });

  // Bug prevented: a range being read as just its start.
  it('reads time ranges', () => {
    expect(parseQuickAdd('Call Sam 2-3:30pm', NOW)).toMatchObject({
      text: 'Call Sam',
      dueTime: '14:00',
      endTime: '15:30',
    });
    for (const text of ['Call Sam 2–3:30pm', 'Call Sam 2pm-3:30pm', 'Call Sam 14:00-15:30']) {
      expect(parseQuickAdd(text, NOW)).toMatchObject({
        text: 'Call Sam',
        dueTime: '14:00',
        endTime: '15:30',
      });
    }
    expect(parseQuickAdd('Call Sam tomorrow 2pm to 3:30pm', NOW)).toMatchObject({
      text: 'Call Sam',
      dueDate: '2026-10-01',
      dueTime: '14:00',
      endTime: '15:30',
    });
    expect(parseQuickAdd('Workshop fri from 9 to 10:30', NOW)).toMatchObject({
      dueDate: '2026-10-02',
      dueTime: '09:00',
      endTime: '10:30',
    });
  });

  it('shows the range in the due chip', () => {
    const r = parseQuickAdd('Standup 9-10am tomorrow', NOW);
    expect(r).toMatchObject({ dueDate: '2026-10-01', dueTime: '09:00', endTime: '10:00' });
    expect(r.chips).toEqual([formatDue('2026-10-01', '09:00', NOW, '10:00')]);
  });

  // Bug prevented: "5-6" reading 5 as 17:00 but 6 as 06:00, an end before the start.
  it('moves an end that would be before the start to the afternoon', () => {
    expect(parseQuickAdd('Gym tomorrow at 5-6', NOW)).toMatchObject({
      dueTime: '17:00',
      endTime: '18:00',
    });
  });

  // Bug prevented: "for 45m" being read by chrono as the time 10:45, or not added to the start.
  it('adds "for N" to the start time and drops the token', () => {
    expect(parseQuickAdd('Call Sam 2pm for 45m', NOW)).toMatchObject({
      text: 'Call Sam',
      dueTime: '14:00',
      endTime: '14:45',
    });
    const forms: [string, string][] = [
      ['for 45 min', '14:45'],
      ['for 1h', '15:00'],
      ['for 1h30m', '15:30'],
      ['for 1 hour 15 minutes', '15:15'],
      ['FOR 30 MINS', '14:30'],
    ];
    for (const [token, end] of forms) {
      expect(parseQuickAdd(`Call Sam 2pm ${token}`, NOW)).toMatchObject({
        text: 'Call Sam',
        dueTime: '14:00',
        endTime: end,
      });
    }
  });

  // Bug prevented: "for 45m" in an ordinary sentence being eaten or inventing a time.
  it('leaves "for N" in the title when there is no due time', () => {
    expect(parseQuickAdd('Write report for 45m', NOW)).toMatchObject({
      text: 'Write report for 45m',
      ...noDates,
    });
  });

  // Bug prevented: a duration running past midnight giving an end time on the next day.
  it('keeps "for N" in the title when it would cross midnight', () => {
    expect(parseQuickAdd('Stay up 11pm for 2h', NOW)).toMatchObject({
      text: 'Stay up for 2h',
      dueTime: '23:00',
      endTime: null,
    });
  });

  // Bug prevented: a duration overriding an explicit range, or vanishing from the title.
  it('keeps "for N" in the title when a range already gave the end', () => {
    expect(parseQuickAdd('Call 2-3pm for 45m', NOW)).toMatchObject({
      text: 'Call for 45m',
      dueTime: '14:00',
      endTime: '15:00',
    });
  });

  // Bug prevented: "2-3 people" being read as a time range.
  it('does not read "2-3 people" as a date', () => {
    expect(parseQuickAdd('Plan 2-3 people', NOW)).toMatchObject({
      text: 'Plan 2-3 people',
      ...noDates,
    });
  });

  const noMarkers = (text: string) => !/[\ue000-\ue1ff]/.test(text);

  // Bug prevented: a "!word" inside a held brace leaving raw private-use marker characters in the title.
  it('restores a held token that sits inside a held brace', () => {
    const r = parseQuickAdd('Notes {ask !Sam later}', NOW);
    expect(r.text).toBe('Notes {ask !Sam later}');
    expect(noMarkers(r.text)).toBe(true);
    const d = parseQuickAdd('x {a for 45m b} tomorrow 2pm', NOW);
    expect(d).toMatchObject({
      text: 'x {a for 45m b}',
      dueTime: '14:00',
      endTime: null,
      deadline: null,
    });
    expect(noMarkers(d.text)).toBe(true);
  });

  // Bug prevented: "{for 45m}" or "{now}" being taken as a deadline.
  it('does not read a duration or "now" in braces as a deadline', () => {
    expect(parseQuickAdd('Pay {for 45m}', NOW)).toMatchObject({
      text: 'Pay {for 45m}',
      deadline: null,
    });
    expect(parseQuickAdd('Pay {now}', NOW)).toMatchObject({ text: 'Pay {now}', deadline: null });
    expect(parseQuickAdd('{fri 5pm} Call', NOW)).toMatchObject({
      text: 'Call',
      deadline: '2026-10-02',
    });
  });

  // Bug prevented: "for 45m." or "for 30m," not being read as a duration because of the punctuation.
  it('reads a duration followed by punctuation', () => {
    expect(parseQuickAdd('Write report 2pm for 45m.', NOW)).toMatchObject({
      text: 'Write report .',
      dueTime: '14:00',
      endTime: '14:45',
    });
    expect(parseQuickAdd('Run 9am for 30m, then stretch', NOW)).toMatchObject({
      text: 'Run , then stretch',
      dueTime: '09:00',
      endTime: '09:30',
    });
  });

  // Bug prevented: stray braces or a lone "!" hanging or garbling the title on every keystroke.
  it('returns stray braces and a lone "!" as typed', () => {
    for (const t of ['x {}', '!', '{', '}', '{}{}']) {
      const r = parseQuickAdd(t, NOW);
      expect(r.text).toBe(t);
      expect(noMarkers(r.text)).toBe(true);
    }
  });

  // Bug prevented: past 256 held tokens, markers leaking into the title.
  it('restores any number of held tokens', () => {
    const words = Array.from({ length: 300 }, (_, i) => `{w${i}}`).join(' ');
    const r = parseQuickAdd(words, NOW);
    expect(r.text).toBe(words);
  });

  // Bug prevented: typed private-use characters surviving into the title as stray markers.
  it('never leaves private-use characters in the title', () => {
    expect(parseQuickAdd('a \ue000\ue100\ue001 b', NOW).text).toBe('a b');
  });

  // Bug prevented: a typed marker sequence inside a held brace or "!word" making the restore
  // step put its own marker back forever, so the quick-add preview hung on every keystroke.
  it('finishes when the typed text looks like a held-token marker', () => {
    expect(parseQuickAdd('x {\ue000\ue100\ue000}', NOW).text).toBe('x {}');
    expect(parseQuickAdd('x !\ue000\ue100\ue000y', NOW).text).toBe('x !y');
  });
});
