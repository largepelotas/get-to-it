import * as chrono from 'chrono-node';
import type { Priority, Recurrence, Weekday } from '@/data/types';
import { formatDue, toDateKey, toTimeString, todayKey, type DateKey } from './dates';
import { describeRecurrence, firstOccurrence, WORKDAYS } from './recurrence';

export interface QuickAddResult {
  text: string;
  dueDate: DateKey | null;
  dueTime: string | null;
  recurrence: Recurrence | null;
  priority: Priority;
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
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  let text = input;
  let priority: Priority = 0;
  let recurrence: Recurrence | null = null;
  let dueDate: DateKey | null = null;
  let dueTime: string | null = null;

  const p = findPriority(text);
  if (p) {
    priority = p.priority;
    text = cut(text, p.start, p.end);
  }

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
    const dayGiven = s.isCertain('day') || s.isCertain('weekday');
    let date = s.date();
    if (s.isCertain('hour')) {
      const hours = date.getHours();
      // "at 5" most likely means 5 PM, not 5 AM.
      if (!s.isCertain('meridiem') && hours >= 1 && hours <= 6) {
        if (dayGiven) {
          date.setHours(hours + 12);
        } else {
          // A time on its own means the next time it comes round.
          const next = new Date(now);
          next.setHours(hours + 12, date.getMinutes(), 0, 0);
          if (next <= now) next.setDate(next.getDate() + 1);
          date = next;
        }
      }
      dueTime = toTimeString(date);
    }
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

  const clean = tidy(text);
  return {
    // If everything was consumed, keep the original words as the title.
    text: clean || input.trim(),
    dueDate,
    dueTime,
    recurrence,
    priority,
    chips,
  };
}
