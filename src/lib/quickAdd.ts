import * as chrono from 'chrono-node';
import type { Priority, Recurrence, Weekday } from '@/data/types';
import {
  formatDue,
  formatTimestamp,
  toDateKey,
  toTimeString,
  todayKey,
  type DateKey,
} from './dates';
import type { ReminderSpec } from './reminders';
import { describeRecurrence, firstOccurrence, WORKDAYS } from './recurrence';

export interface QuickAddResult {
  text: string;
  dueDate: DateKey | null;
  dueTime: string | null;
  recurrence: Recurrence | null;
  priority: Priority;
  /** The list named with `#List`, if it matched one of `options.lists`. */
  listId: string | null;
  /** The section named with `/Section` in the target list, if it matched one of `options.sections`. */
  sectionId: string | null;
  /** Existing labels named with `@name`, each once, in the order typed. */
  labelIds: string[];
  /** Names from `@name` tokens that match no existing label, as typed, each once. */
  newLabels: string[];
  /** From a `!` token. A relative one only means something on a task with a due date. */
  reminder: ReminderSpec | null;
  /** Short labels for what was understood, shown as a preview. */
  chips: string[];
}

const DAY_NAMES: Record<string, Weekday> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
const DAY = '(?:sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)(?:day|nesday|urday|sday)?';
const UNIT = '(day|week|month|year)s?';
const FREQ: Record<string, Recurrence['freq']> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

interface Match {
  rule: Recurrence;
  start: number;
  end: number;
}

function findRecurrence(text: string): Match | null {
  const patterns: [RegExp, (m: RegExpExecArray) => Recurrence | null][] = [
    [
      new RegExp(
        `\\bevery\\s+(\\d+|other)\\s+${UNIT}\\s+after\\s+(?:completion|done|finishing)\\b`,
        'i',
      ),
      (m) => ({
        freq: FREQ[m[2].toLowerCase()],
        interval: m[1].toLowerCase() === 'other' ? 2 : Number(m[1]),
        mode: 'completion',
      }),
    ],
    [
      new RegExp(`\\b(\\d+)\\s+${UNIT}\\s+after\\s+(?:completion|done|finishing)\\b`, 'i'),
      (m) => ({ freq: FREQ[m[2].toLowerCase()], interval: Number(m[1]), mode: 'completion' }),
    ],
    [
      /\b(?:every\s+weekday|weekdays)\b/i,
      () => ({ freq: 'weekly', interval: 1, weekdays: [...WORKDAYS], mode: 'schedule' }),
    ],
    [
      /\bevery\s+weekend\b/i,
      () => ({ freq: 'weekly', interval: 1, weekdays: [0, 6], mode: 'schedule' }),
    ],
    [
      new RegExp(`\\bevery\\s+(${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`, 'i'),
      (m) => {
        const days = m[1]
          .toLowerCase()
          .split(/\s*(?:,|and|&)\s*/)
          .map((d) => DAY_NAMES[d])
          .filter((d): d is Weekday => d !== undefined);
        return days.length
          ? { freq: 'weekly', interval: 1, weekdays: [...new Set(days)], mode: 'schedule' }
          : null;
      },
    ],
    [
      new RegExp(`\\bevery\\s+(\\d+|other)\\s+${UNIT}\\b`, 'i'),
      (m) => ({
        freq: FREQ[m[2].toLowerCase()],
        interval: m[1].toLowerCase() === 'other' ? 2 : Number(m[1]),
        mode: 'schedule',
      }),
    ],
    [
      new RegExp(`\\bevery\\s+${UNIT}\\b`, 'i'),
      (m) => ({ freq: FREQ[m[1].toLowerCase()], interval: 1, mode: 'schedule' }),
    ],
    [
      /\b(daily|weekly|monthly|yearly|annually)\b/i,
      (m) => {
        const word = m[1].toLowerCase();
        const freq = word === 'annually' ? 'yearly' : (word as Recurrence['freq']);
        return { freq, interval: 1, mode: 'schedule' };
      },
    ],
  ];
  for (const [re, build] of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const rule = build(m);
    if (rule && rule.interval >= 1) return { rule, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function findPriority(text: string): { priority: Priority; start: number; end: number } | null {
  const m = /(^|\s)(p[1-3]|!{1,3})(?=\s|$)/i.exec(text);
  if (!m) return null;
  const token = m[2].toLowerCase();
  const priority = (token.startsWith('p') ? Number(token[1]) : 4 - token.length) as Priority;
  const start = m.index + m[1].length;
  return { priority, start, end: start + m[2].length };
}

type Parsed = ReturnType<typeof chrono.parse>[number]['start'];

/**
 * The moment chrono read. A small hour with no am/pm ("at 5") most likely
 * means the afternoon, not 5 AM.
 */
function resolveHour(s: Parsed, now: Date): Date {
  const dayGiven = s.isCertain('day') || s.isCertain('weekday');
  const date = s.date();
  if (!s.isCertain('hour')) return date;
  const hours = date.getHours();
  if (s.isCertain('meridiem') || hours < 1 || hours > 6) return date;
  if (dayGiven) {
    date.setHours(hours + 12);
    return date;
  }
  // A time on its own means the next time it comes round.
  const next = new Date(now);
  next.setHours(hours + 12, date.getMinutes(), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export interface QuickAddOptions {
  /** Lists a `#List` token can name. */
  lists?: { id: string; title: string }[];
  /** Sections a `/Section` token can name, when they are in the target list. */
  sections?: { id: string; listId: string; title: string }[];
  /**
   * Labels an `@name` token can name. Left out, `@` is never a token (a caller
   * that doesn't do labels, such as grocery).
   */
  labels?: { id: string; name: string }[];
  /** The list the task goes to when no `#List` is typed; decides which sections `/Section` can name. */
  listId?: string | null;
  /** The due date the caller will give a task without one; lets a relative reminder show. */
  defaultDue?: string | null;
}

/**
 * A token made of a marker and a title: the longest title right after a marker character
 * that starts a word and ending at whitespace or the end of the text.
 */
function findToken(
  text: string,
  marker: string,
  lists: { id: string; title: string }[],
): { id: string; title: string; start: number; end: number } | null {
  const candidates = lists
    .map((l) => ({ ...l, key: l.title.trim().toLowerCase() }))
    .filter((l) => l.key)
    .sort((a, b) => b.key.length - a.key.length);
  const lower = text.toLowerCase();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== marker || (i > 0 && !/\s/.test(text[i - 1]))) continue;
    for (const l of candidates) {
      const end = i + 1 + l.key.length;
      if (!lower.startsWith(l.key, i + 1)) continue;
      if (end < text.length && !/\s/.test(text[end])) continue;
      return { id: l.id, title: l.title.trim(), start: i, end };
    }
  }
  return null;
}

/** A `#List` token. */
function findList(
  text: string,
  lists: { id: string; title: string }[],
): { id: string; title: string; start: number; end: number } | null {
  return findToken(text, '#', lists);
}

/** A `/Section` token: the longest title of a section in the target list right after a `/` that starts a word. */
function findSection(
  text: string,
  sections: { id: string; title: string }[],
): { id: string; title: string; start: number; end: number } | null {
  return findToken(text, '/', sections);
}

interface LabelToken {
  start: number;
  end: number;
  /** The id of an existing label; null for a new one. */
  id: string | null;
  /** The stored spelling of an existing label, or the word as typed. */
  name: string;
}

const LABEL_WORD = /^[\p{L}\p{N}_-]+/u;

/**
 * Every `@label` token: an `@` that starts a word, followed by the longest existing
 * label name (any case) ending at whitespace or the end, or else by a single word.
 */
function findLabels(text: string, labels: { id: string; name: string }[]): LabelToken[] {
  const candidates = labels
    .map((l) => ({ ...l, key: l.name.trim().toLowerCase() }))
    .filter((l) => l.key)
    .sort((a, b) => b.key.length - a.key.length);
  const lower = text.toLowerCase();
  const found: LabelToken[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || (i > 0 && !/\s/.test(text[i - 1]))) continue;
    const atBoundary = (end: number) => end >= text.length || /\s/.test(text[end]);
    const existing = candidates.find(
      (l) => lower.startsWith(l.key, i + 1) && atBoundary(i + 1 + l.key.length),
    );
    if (existing) {
      const end = i + 1 + existing.key.length;
      found.push({ start: i, end, id: existing.id, name: existing.name.trim() });
      i = end - 1;
      continue;
    }
    const word = LABEL_WORD.exec(text.slice(i + 1))?.[0];
    if (word && atBoundary(i + 1 + word.length)) {
      const end = i + 1 + word.length;
      found.push({ start: i, end, id: null, name: word });
      i = end - 1;
    }
  }
  return found;
}

const REMINDER_UNIT = /^(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)(?:\s+before)?(?=\s|$)/i;

/** Reads the reminder token starting at the `!` at `start`, or null if it isn't one. */
function readReminder(
  text: string,
  start: number,
  now: Date,
): { spec: ReminderSpec; start: number; end: number } | null {
  const rest = text.slice(start + 1);

  const due = /^due(?=\s|$)/i.exec(rest);
  if (due) {
    return { spec: { kind: 'relative', offsetMinutes: 0 }, start, end: start + 1 + due[0].length };
  }
  const rel = REMINDER_UNIT.exec(rest);
  if (rel) {
    const unit = rel[2].toLowerCase()[0];
    const per = unit === 'm' ? 1 : unit === 'h' ? 60 : 1440;
    return {
      spec: { kind: 'relative', offsetMinutes: Number(rel[1]) * per },
      start,
      end: start + 1 + rel[0].length,
    };
  }
  const found = chrono
    .parse(rest, now, { forwardDate: true })
    .find((res) => res.index === 0 && res.start.isCertain('hour'));
  if (!found) return null;
  const at = resolveHour(found.start, now).getTime();
  return { spec: { kind: 'absolute', at }, start, end: start + 1 + found.text.length };
}

/** A `!` reminder token: "!30min", "!2 hours before", "!due", "!tomorrow 9am". The first valid one. */
function findReminder(
  text: string,
  now: Date,
): { spec: ReminderSpec; start: number; end: number } | null {
  for (const m of text.matchAll(/(^|\s)!(?=[^\s!])/g)) {
    const found = readReminder(text, m.index + m[1].length, now);
    if (found) return found;
  }
  return null;
}

/** Marks `!word` tokens that are not reminders so the date step can't read into them. */
const HOLD = String.fromCharCode(0xe000);

function describeReminder(spec: ReminderSpec, now: Date): string {
  if (spec.kind === 'absolute') return `Remind ${formatTimestamp(spec.at, now)}`;
  const n = spec.offsetMinutes;
  if (n === 0) return 'Remind at due time';
  if (n % 1440 === 0) return `Remind ${n / 1440} ${n === 1440 ? 'day' : 'days'} before`;
  if (n % 60 === 0) return `Remind ${n / 60} hr before`;
  return `Remind ${n} min before`;
}

const LIST_MARKER = /^\s*(?:[-*•]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/** The non-empty lines of pasted text, with bullets, numbers and checkboxes removed. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter(Boolean);
}

function cut(text: string, start: number, end: number): string {
  return `${text.slice(0, start)} ${text.slice(end)}`;
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:on|at|by|due|from|starting)\s*$/i, '')
    .replace(/^\s*(?:on|at|by|due)\s+/i, '')
    .trim();
}

/**
 * Reads a due date, time, repeat rule and priority out of quick-add text,
 * e.g. "Send report fri 3pm p1" or "Standup every weekday 9:30".
 */
export function parseQuickAdd(
  input: string,
  now: Date = new Date(),
  options: QuickAddOptions = {},
): QuickAddResult {
  let text = input;
  let listId: string | null = null;
  let listTitle = '';
  let sectionId: string | null = null;
  let sectionTitle = '';
  let reminder: ReminderSpec | null = null;
  let priority: Priority = 0;
  let recurrence: Recurrence | null = null;
  let dueDate: DateKey | null = null;
  let dueTime: string | null = null;

  const l = options.lists?.length ? findList(text, options.lists) : null;
  if (l) {
    listId = l.id;
    listTitle = l.title;
    text = cut(text, l.start, l.end);
  }

  const sectionPool = (options.sections ?? []).filter(
    (s) => s.listId === (listId ?? options.listId ?? null),
  );
  const sec = sectionPool.length ? findSection(text, sectionPool) : null;
  if (sec) {
    sectionId = sec.id;
    sectionTitle = sec.title;
    text = cut(text, sec.start, sec.end);
  }

  // Labels: every `@name`, taken out of the title. The same one twice counts once.
  const labelIds: string[] = [];
  const newLabels: string[] = [];
  const labelChips: string[] = [];
  if (options.labels) {
    const tokens = findLabels(text, options.labels);
    for (const t of tokens) {
      if (t.id !== null) {
        if (labelIds.includes(t.id)) continue;
        labelIds.push(t.id);
        labelChips.push(`@${t.name}`);
      } else {
        if (newLabels.some((n) => n.toLowerCase() === t.name.toLowerCase())) continue;
        newLabels.push(t.name);
        labelChips.push(`@${t.name} (new)`);
      }
    }
    for (const t of [...tokens].reverse()) text = cut(text, t.start, t.end);
  }

  const p = findPriority(text);
  if (p) {
    priority = p.priority;
    text = cut(text, p.start, p.end);
  }

  const rem = findReminder(text, now);
  if (rem) {
    reminder = rem.spec;
    text = cut(text, rem.start, rem.end);
  }
  // A "!word" that isn't a reminder stays in the title exactly as typed.
  const held: string[] = [];
  text = text.replace(/(^|\s)(!(?=[^\s!])\S*)/g, (_, space: string, token: string) => {
    held.push(token);
    return space + HOLD.repeat(token.length);
  });

  const r = findRecurrence(text);
  if (r) {
    recurrence = r.rule;
    text = cut(text, r.start, r.end);
  }

  const results = chrono.parse(text, now, { forwardDate: true });
  const result = results.find((res) => {
    const s = res.start;
    // A bare month ("notes for March") or number is too vague to be a due date.
    return (
      /[a-z:]/i.test(res.text) &&
      (s.isCertain('day') || s.isCertain('weekday') || s.isCertain('hour'))
    );
  });
  if (result) {
    const s = result.start;
    const date = resolveHour(s, now);
    if (s.isCertain('hour')) dueTime = toTimeString(date);
    dueDate = toDateKey(date);
    text = cut(text, result.index, result.index + result.text.length);
  }

  if (recurrence) {
    // Repeats start on the first matching day from the parsed date, or today.
    dueDate = firstOccurrence(recurrence, dueDate ?? todayKey(now));
  }

  const chips: string[] = [];
  if (dueDate) chips.push(formatDue(dueDate, dueTime, now));
  if (recurrence) chips.push(describeRecurrence(recurrence, dueDate));
  if (priority) chips.push(`P${priority}`);
  if (listId) chips.push(`#${listTitle}`);
  if (sectionId) chips.push(`/${sectionTitle}`);
  chips.push(...labelChips);
  if (reminder && (reminder.kind === 'absolute' || dueDate || options.defaultDue)) {
    chips.push(describeReminder(reminder, now));
  }

  const clean = tidy(text).replace(new RegExp(`${HOLD}+`, 'g'), () => held.shift() ?? '');
  return {
    // If everything was consumed, keep the original words as the title.
    text: clean || input.trim(),
    dueDate,
    dueTime,
    recurrence,
    priority,
    listId,
    sectionId,
    labelIds,
    newLabels,
    reminder,
    chips,
  };
}
