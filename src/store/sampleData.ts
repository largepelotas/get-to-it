import {
  emptyTables,
  type ColorName,
  type HabitGoal,
  type Priority,
  type Recurrence,
  type Weekday,
} from '@/data/types';
import { addDaysKey, todayKey, toTimestamp } from '@/lib/dates';
import { newId } from '@/lib/id';
import { fireMark, fireTime } from '@/lib/reminders';
import { docFromText, docToPlainText, type RichNode } from '@/lib/richText';
import { insertFolder } from './actions/folders';
import { keyAt, listSections } from './actions/helpers';
import { insertItem } from './actions/items';
import { ensureLabel } from './actions/labels';
import { insertList } from './actions/lists';
import { insertReminder } from './actions/reminders';
import { commit, replaceData, setSetting, useData } from './data';
import type { Tx } from './history';
import { welcomeDoc } from './seed';

/*
 * Sample data for development: a believable set of lists, tasks, habits and
 * notes, with a year of history behind them, so every view has something in
 * it. Dates are worked out from the day it's made. Only loaded in dev (see
 * main.tsx); a production build never includes it.
 */

/** How far back the made-up history goes, in days. The heatmaps show a year. */
const HISTORY_DAYS = 365;

/** A small seeded generator (mulberry32), so the same day always gives the same data. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SampleTask {
  text: string;
  /** Due this many days from today (negative is overdue). */
  due?: number;
  time?: string;
  end?: string;
  /** Deadline, in days from today. */
  deadline?: number;
  priority?: Priority;
  labels?: string[];
  repeat?: Recurrence;
  notes?: string;
  /** A reminder this many minutes before it's due. */
  remind?: number;
  /** Finished this many days ago. Its subtasks are finished with it. */
  done?: number;
  wontDo?: boolean;
  sub?: SampleTask[];
}

interface SampleGrocery {
  text: string;
  quantity?: string;
  category: string;
  checked?: boolean;
}

const weekly = (weekdays?: Weekday[]): Recurrence => ({
  freq: 'weekly',
  interval: 1,
  mode: 'schedule',
  ...(weekdays ? { weekdays } : {}),
});
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

// Rich text

const text = (value: string, bold = false): RichNode =>
  bold ? { type: 'text', text: value, marks: [{ type: 'bold' }] } : { type: 'text', text: value };
const paragraph = (...content: (string | RichNode)[]): RichNode => ({
  type: 'paragraph',
  content: content.map((c) => (typeof c === 'string' ? text(c) : c)),
});
const heading = (level: number, value: string): RichNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const bullets = (...lines: string[]): RichNode => ({
  type: 'bulletList',
  content: lines.map((l) => ({ type: 'listItem', content: [paragraph(l)] })),
});
const numbered = (...lines: string[]): RichNode => ({
  type: 'orderedList',
  content: lines.map((l) => ({ type: 'listItem', content: [paragraph(l)] })),
});
const checklist = (...lines: [checked: boolean, text: string][]): RichNode => ({
  type: 'taskList',
  content: lines.map(([checked, l]) => ({
    type: 'taskItem',
    attrs: { checked },
    content: [paragraph(l)],
  })),
});
const quote = (value: string): RichNode => ({ type: 'blockquote', content: [paragraph(value)] });
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content });

// The content

const LABELS: [name: string, color: ColorName][] = [
  ['errands', 'green'],
  ['home', 'teal'],
  ['calls', 'orange'],
  ['waiting', 'gray'],
  ['deep work', 'purple'],
  ['quick', 'amber'],
];

const INBOX: SampleTask[] = [
  { text: 'Renew passport', due: 0, priority: 1, labels: ['errands'], deadline: 12, remind: 60 },
  {
    text: 'Dentist check-up',
    due: 0,
    time: '15:30',
    end: '16:15',
    labels: ['calls'],
    remind: 30,
    notes: 'Dr Osei, second floor. Bring the insurance card.',
  },
  { text: 'Reply to Maya about the weekend', due: 0, labels: ['quick'] },
  { text: 'Pay the electricity bill', due: -2, priority: 2, remind: 0 },
  { text: 'Return library books', due: -1, labels: ['errands'] },
  { text: 'Book the car in for its service', due: 1, time: '09:00', labels: ['calls'], remind: 15 },
  { text: 'Pick up the dry cleaning', due: 1, labels: ['errands'] },
  { text: 'Back up the laptop', due: 3, priority: 3 },
  { text: 'Buy a birthday present for Dad', due: 5, deadline: 9, priority: 2, labels: ['errands'] },
  { text: 'Cancel the unused streaming subscription', labels: ['quick'] },
  { text: 'Look into a standing desk' },
  { text: 'Ask Priya for the sourdough recipe', labels: ['waiting'] },
  {
    text: 'Sort out the photo library',
    priority: 3,
    sub: [
      { text: 'Delete the duplicates', done: 4 },
      { text: 'Make an album for 2025' },
      { text: 'Print a few for the hallway' },
    ],
  },
  { text: 'Send the signed lease back', done: 0 },
  { text: 'Order printer ink', done: 0 },
  { text: 'Call the bank about the card', done: 1, labels: ['calls'] },
  { text: 'Fix the bike puncture', done: 2 },
  { text: 'Post the parcel to Tom', done: 3, labels: ['errands'] },
  { text: 'Update the emergency contacts', done: 5 },
  { text: 'Learn to juggle', done: 6, wontDo: true },
  { text: 'Renew the parking permit', done: 8 },
  { text: 'Book flights for December', done: 11, priority: 2 },
];

const WEBSITE: [section: string | null, tasks: SampleTask[]][] = [
  [
    null,
    [
      {
        text: 'Weekly status update',
        due: 2,
        repeat: weekly(),
        priority: 3,
        notes: 'Three lines: what shipped, what’s next, what’s blocked.',
      },
      {
        text: 'Agree the launch date with marketing',
        due: 0,
        time: '11:00',
        end: '11:30',
        priority: 1,
        remind: 10,
      },
    ],
  ],
  [
    'Design',
    [
      {
        text: 'Homepage redesign',
        priority: 1,
        due: 1,
        deadline: 6,
        labels: ['deep work'],
        notes: 'Hero, three feature blocks, pricing teaser. The mock-ups are in the shared folder.',
        sub: [
          { text: 'Wireframes', done: 9 },
          { text: 'Visual design', done: 3 },
          { text: 'Mobile layout', due: 1 },
          { text: 'Review with Sam', due: 2, time: '14:00', end: '14:45' },
        ],
      },
      { text: 'Choose the photography', due: 4, labels: ['waiting'] },
      { text: 'Write the About page copy', due: -3, priority: 2, labels: ['deep work'] },
      { text: 'Pick the type scale', done: 12 },
      { text: 'Colour palette', done: 15 },
      { text: 'Logo refresh', done: 20, wontDo: true },
    ],
  ],
  [
    'Build',
    [
      {
        text: 'Move the blog to the new templates',
        due: 0,
        time: '13:00',
        end: '15:00',
        priority: 2,
        labels: ['deep work'],
        sub: [
          { text: 'Export the old posts', done: 2 },
          { text: 'Redirects for old URLs' },
          { text: 'Check the RSS feed' },
        ],
      },
      { text: 'Contact form', due: 3, priority: 2 },
      { text: 'Set up analytics', due: 6, priority: 3 },
      { text: 'Image compression in the build', due: 8 },
      { text: 'Accessibility pass', due: 9, deadline: 13, priority: 1 },
      { text: 'Set up the staging site', done: 7 },
      { text: 'Navigation and footer', done: 5 },
      { text: 'Pricing page', done: 1 },
    ],
  ],
  [
    'Launch',
    [
      { text: 'Write the announcement post', due: 10, labels: ['deep work'] },
      { text: 'Tell the support team what’s changing', due: 12, labels: ['calls'] },
      { text: 'DNS switch', due: 14, time: '08:00', priority: 1, remind: 60 },
      { text: 'Check the site on old phones', due: 13 },
      { text: 'Celebrate', due: 14 },
    ],
  ],
];

const TEAM: SampleTask[] = [
  { text: 'Plan the day', due: 0, repeat: weekly(WEEKDAYS), labels: ['quick'] },
  { text: 'Review pull requests', due: 0, repeat: weekly([1, 3, 5]) },
  { text: '1:1 with Sam', due: 2, time: '10:00', end: '10:30', repeat: weekly(), remind: 10 },
  {
    text: 'Team retro',
    due: 4,
    time: '16:00',
    end: '17:00',
    repeat: { freq: 'weekly', interval: 2, mode: 'schedule' },
  },
  {
    text: 'Submit expenses',
    due: -4,
    priority: 2,
    repeat: { freq: 'monthly', interval: 1, mode: 'schedule' },
  },
  { text: 'Write Dana’s peer feedback', due: 1, priority: 1, deadline: 3, labels: ['deep work'] },
  { text: 'Interview: frontend candidate', due: 3, time: '13:30', end: '14:30', remind: 30 },
  { text: 'Chase IT about the new laptop', labels: ['waiting'] },
  { text: 'Draft the Q4 goals', due: 7, priority: 2, labels: ['deep work'] },
  { text: 'Book the offsite venue', due: 9, labels: ['calls'] },
  { text: 'Onboarding notes for the new starter', done: 1 },
  { text: 'Approve the holiday requests', done: 2 },
  { text: 'Share the roadmap deck', done: 4, priority: 1 },
  { text: 'Fix the flaky test run', done: 6 },
  { text: 'Renew the design tool licence', done: 9 },
  { text: 'Hiring plan for next year', done: 13 },
];

const HOUSE: [section: string | null, tasks: SampleTask[]][] = [
  [
    'Chores',
    [
      {
        text: 'Water the plants',
        due: 0,
        labels: ['home'],
        repeat: { freq: 'daily', interval: 3, mode: 'completion' },
      },
      { text: 'Take out the recycling', due: 1, labels: ['home'], repeat: weekly() },
      { text: 'Clean the bathroom', due: -1, labels: ['home'], repeat: weekly() },
      {
        text: 'Change the bed sheets',
        due: 5,
        labels: ['home'],
        repeat: { freq: 'weekly', interval: 2, mode: 'schedule' },
      },
      {
        text: 'Check the smoke alarms',
        due: 20,
        repeat: { freq: 'monthly', interval: 6, mode: 'schedule' },
      },
    ],
  ],
  [
    'Repairs',
    [
      { text: 'Fix the dripping kitchen tap', due: 2, priority: 2, labels: ['home'] },
      { text: 'Get a quote for the fence', labels: ['calls', 'waiting'] },
      {
        text: 'Repaint the hallway',
        due: 16,
        sub: [
          { text: 'Choose the colour', done: 3 },
          { text: 'Buy paint and rollers', due: 6, labels: ['errands'] },
          { text: 'Fill the cracks' },
          { text: 'Two coats' },
        ],
      },
      { text: 'Replace the hallway bulb', done: 2 },
      { text: 'Bleed the radiators', done: 10 },
    ],
  ],
  [
    'Garden',
    [
      { text: 'Plant the spring bulbs', due: 6, labels: ['home'] },
      { text: 'Rake the leaves', due: 2 },
      { text: 'Put the garden furniture away', due: 12 },
      { text: 'Mow the lawn', done: 4 },
    ],
  ],
];

const TRIP: [section: string | null, tasks: SampleTask[]][] = [
  [
    'Before we go',
    [
      { text: 'Book the airport transfer', due: 4, priority: 2 },
      { text: 'Travel insurance', due: 7, deadline: 20, priority: 1 },
      { text: 'Reserve a table at Ramiro', due: 10, labels: ['calls'] },
      { text: 'Ask Jo to feed the cat', due: 15, labels: ['waiting'] },
      { text: 'Download offline maps', due: 20, labels: ['quick'] },
      { text: 'Book the flights', done: 14 },
      { text: 'Book the apartment in Alfama', done: 12 },
    ],
  ],
  [
    'Packing',
    [
      { text: 'Passports' },
      { text: 'Chargers and a plug adapter' },
      { text: 'Walking shoes' },
      { text: 'Sun cream' },
      { text: 'A book for the flight' },
    ],
  ],
  [
    'While we’re there',
    [
      { text: 'Tram 28 early, before the queues' },
      { text: 'Day trip to Sintra' },
      { text: 'Pastéis de Belém' },
      { text: 'LX Factory on Sunday' },
    ],
  ],
];

const PLANNING: SampleTask[] = [
  { text: 'Collect feedback from the team', done: 70 },
  { text: 'Review last quarter’s numbers', done: 68, priority: 2 },
  { text: 'Draft the priorities', done: 66, priority: 1 },
  { text: 'Budget request', done: 63 },
  { text: 'Present to leadership', done: 60, priority: 1 },
  { text: 'Share the final plan', done: 58 },
  { text: 'Hackathon proposal', done: 57, wontDo: true },
];

const GROCERIES: SampleGrocery[] = [
  { text: 'Bananas', quantity: '6', category: 'produce' },
  { text: 'Lemons', quantity: '3', category: 'produce' },
  { text: 'Spinach', quantity: '200 g', category: 'produce' },
  { text: 'Cherry tomatoes', category: 'produce', checked: true },
  { text: 'Avocados', quantity: '2', category: 'produce' },
  { text: 'Sourdough loaf', category: 'bakery' },
  { text: 'Bagels', quantity: '4', category: 'bakery', checked: true },
  { text: 'Chicken thighs', quantity: '600 g', category: 'meat' },
  { text: 'Salmon fillets', quantity: '2', category: 'meat' },
  { text: 'Milk', quantity: '2 l', category: 'dairy' },
  { text: 'Greek yoghurt', category: 'dairy' },
  { text: 'Eggs', quantity: '12', category: 'dairy', checked: true },
  { text: 'Cheddar', category: 'dairy' },
  { text: 'Frozen peas', category: 'frozen' },
  { text: 'Olive oil', category: 'pantry' },
  { text: 'Basmati rice', quantity: '1 kg', category: 'pantry' },
  { text: 'Tinned tomatoes', quantity: '4', category: 'pantry' },
  { text: 'Peanut butter', category: 'pantry', checked: true },
  { text: 'Dark chocolate', category: 'snacks' },
  { text: 'Coffee beans', quantity: '500 g', category: 'drinks' },
  { text: 'Sparkling water', quantity: '6', category: 'drinks' },
  { text: 'Dishwasher tablets', category: 'household' },
  { text: 'Bin bags', category: 'household' },
  { text: 'Toothpaste', category: 'personal' },
];

const DINNER_PARTY: SampleGrocery[] = [
  { text: 'Lamb shoulder', quantity: '1.5 kg', category: 'meat' },
  { text: 'New potatoes', quantity: '1 kg', category: 'produce' },
  { text: 'Fresh mint', category: 'produce' },
  { text: 'Pomegranate', quantity: '2', category: 'produce' },
  { text: 'Feta', quantity: '200 g', category: 'dairy' },
  { text: 'Double cream', quantity: '300 ml', category: 'dairy' },
  { text: 'Flatbreads', quantity: '8', category: 'bakery' },
  { text: 'Red wine', quantity: '3', category: 'drinks', checked: true },
  { text: 'Candles', category: 'household', checked: true },
  { text: 'Olives', category: 'snacks' },
];

/** `rate` is the chance of a check-in on any day; `streak` is the unbroken run ending today. */
const HABITS: { text: string; goal: HabitGoal; rate: number; streak: number; today: boolean }[] = [
  { text: 'Morning walk', goal: { period: 'day' }, rate: 0.8, streak: 12, today: true },
  { text: 'Read 20 pages', goal: { period: 'day' }, rate: 0.65, streak: 4, today: false },
  { text: 'Stretch', goal: { period: 'day' }, rate: 0.5, streak: 0, today: false },
  { text: 'Gym', goal: { period: 'week', times: 3 }, rate: 0.42, streak: 1, today: true },
  { text: 'Journal', goal: { period: 'week', times: 5 }, rate: 0.7, streak: 3, today: false },
  { text: 'Call family', goal: { period: 'week', times: 1 }, rate: 0.16, streak: 0, today: false },
  { text: 'No phone after 10', goal: { period: 'day' }, rate: 0.55, streak: 2, today: false },
];

const FILTERS: [name: string, query: string, color: ColorName | null][] = [
  ['Urgent', 'p1 | overdue', 'red'],
  ['Work this week', '(#"Website relaunch" | #Team) & 7 days', 'blue'],
  ['Waiting on', '@waiting', 'gray'],
  ['Quick wins', '@quick & !subtask', 'amber'],
  ['Someday', 'no date & no labels', null],
];

const NOTES: [title: string, where: 'top' | 'work' | 'home', content: RichNode][] = [
  ['Welcome', 'top', welcomeDoc()],
  [
    'Meeting notes',
    'work',
    doc(
      heading(1, 'Relaunch kick-off'),
      paragraph(text('Attendees: ', true), 'Sam, Dana, Priya, me'),
      heading(2, 'Decisions'),
      bullets(
        'Launch in two weeks, on a Tuesday morning.',
        'The blog moves over as it is; a redesign comes later.',
        'No new logo for now.',
      ),
      heading(2, 'Actions'),
      checklist(
        [true, 'Sam: share the mock-ups'],
        [true, 'Dana: set up the staging site'],
        [false, 'Priya: choose the photography'],
        [false, 'Me: write the announcement post'],
      ),
      heading(2, 'Open questions'),
      numbered('Who signs off the pricing page?', 'Do we keep the old URLs for the docs?'),
      quote('If it isn’t on the list, it isn’t in the launch.'),
    ),
  ],
  [
    'Ideas',
    'work',
    doc(
      heading(2, 'Things to try'),
      bullets(
        'A changelog page that writes itself from the release notes',
        'Office hours once a fortnight',
        'A dark theme for the docs',
      ),
      paragraph('Most of these need a quiet week. Come back to them after the launch.'),
    ),
  ],
  [
    'Books to read',
    'home',
    doc(
      heading(1, 'Books to read'),
      checklist(
        [true, 'Piranesi, Susanna Clarke'],
        [true, 'The Remains of the Day, Kazuo Ishiguro'],
        [false, 'Stoner, John Williams'],
        [false, 'A Month in the Country, J. L. Carr'],
        [false, 'The Dispossessed, Ursula K. Le Guin'],
      ),
      heading(2, 'Recommended by'),
      bullets('Maya: anything by Claire Keegan', 'Tom: The Wager'),
    ),
  ],
  [
    'Sunday roast',
    'home',
    doc(
      heading(1, 'Sunday roast'),
      paragraph('Serves four. About two hours, most of it waiting.'),
      heading(2, 'Method'),
      numbered(
        'Take the chicken out of the fridge an hour before.',
        'Oven to 200°C. Salt the skin well, lemon and thyme inside.',
        'Roast for 1 hour 20 minutes, potatoes in after 30.',
        'Rest for 15 minutes while the gravy comes together.',
      ),
    ),
  ],
];

/** Tasks that the made-up focus sessions are spread across. */
const FOCUSED = [
  'Homepage redesign',
  'Move the blog to the new templates',
  'Write the About page copy',
  'Draft the Q4 goals',
  'Pricing page',
  'Share the roadmap deck',
];

/** Fills an empty data set. Returns the id of the list quick-add should use. */
export function insertSampleData(tx: Tx, now: Date = new Date()): string {
  const nowMs = now.getTime();
  const today = todayKey(now);
  const day = (offset: number) => addDaysKey(today, offset);
  const rand = random(20260101);
  /** A moment during the working day, `ago` days back, never in the future. */
  const moment = (ago: number) => {
    const minutes = 8 * 60 + Math.floor(rand() * 11 * 60);
    const at = toTimestamp(day(-ago), '00:00') + minutes * 60_000;
    return Math.min(at, nowMs - Math.floor(rand() * 30) * 60_000);
  };
  const allDayTime = useData.getState().settings.allDayReminderTime;
  const byText = new Map<string, string>();

  const labelIds = new Map<string, string>();
  for (const [name, color] of LABELS) labelIds.set(name, ensureLabel(tx, name, color)!);

  function addTask(
    listId: string,
    task: SampleTask,
    sectionId: string | null = null,
    parentId: string | null = null,
    parentDone?: number,
  ): string {
    const done = task.done ?? parentDone;
    const id = insertItem(tx, listId, {
      text: task.text,
      parentId,
      sectionId,
      priority: task.priority,
      labelIds: task.labels?.map((l) => labelIds.get(l)!),
      dueDate: task.due === undefined ? null : day(task.due),
      dueTime: task.time,
      endTime: task.end,
      deadline: task.deadline === undefined ? null : day(task.deadline),
      recurrence: task.repeat,
    });
    byText.set(task.text, id);
    for (const sub of task.sub ?? []) addTask(listId, sub, null, id, done);
    // After the subtasks: adding an open one would reopen a finished parent.
    const item = tx.get('items', id)!;
    const completedAt = done === undefined ? null : moment(done);
    const createdAt = (completedAt ?? nowMs) - (2 + Math.floor(rand() * 12)) * 86_400_000;
    tx.put('items', {
      ...item,
      details: task.notes ? JSON.stringify(docFromText(task.notes)) : null,
      checked: completedAt !== null,
      wontDo: completedAt !== null && !!task.wontDo,
      completedAt,
      createdAt,
      updatedAt: completedAt ?? createdAt,
    });
    if (task.remind !== undefined) {
      const reminderId = insertReminder(tx, id, { kind: 'relative', offsetMinutes: task.remind });
      const reminder = tx.get('reminders', reminderId);
      const at = reminder && fireTime(reminder, tx.get('items', id)!, allDayTime);
      // One that's already past waits in the reminders inbox rather than firing at launch.
      if (reminder && at && at <= nowMs) {
        const firedFor = fireMark(reminder, tx.get('items', id)!, at);
        tx.put('reminders', { ...reminder, firedFor });
      }
    }
    return id;
  }

  function addSections(listId: string, groups: [string | null, SampleTask[]][]): void {
    for (const [title, tasks] of groups) {
      let sectionId: string | null = null;
      if (title) {
        const sections = listSections(tx, listId);
        sectionId = newId();
        tx.put('sections', {
          id: sectionId,
          listId,
          title,
          sortKey: keyAt(sections, sections.length),
          collapsed: false,
          createdAt: tx.now,
          updatedAt: tx.now,
        });
      }
      for (const task of tasks) addTask(listId, task, sectionId);
    }
  }

  function addGroceries(listId: string, items: SampleGrocery[]): void {
    for (const g of items) {
      const id = insertItem(tx, listId, {
        text: g.text,
        quantity: g.quantity,
        category: g.category,
      });
      if (g.checked) tx.update('items', id, { checked: true, completedAt: moment(0) });
    }
  }

  /** Past occurrences of a repeating task, finished on the given days (as days ago). */
  function addCompletions(taskText: string, daysAgo: number[]): void {
    const itemId = byText.get(taskText)!;
    for (const ago of daysAgo) {
      tx.put('completions', { id: newId(), itemId, dueDate: day(-ago), completedAt: moment(ago) });
    }
  }
  /** Every `step` days back from `first`, each kept with chance `rate`. */
  const every = (first: number, step: number, rate = 1) => {
    const out: number[] = [];
    for (let ago = first; ago <= HISTORY_DAYS; ago += step) if (rand() < rate) out.push(ago);
    return out;
  };
  const weekdayAgo = (ago: number) => new Date(toTimestamp(day(-ago), '12:00')).getDay() as Weekday;

  // Lists

  const work = insertFolder(tx, 'Work');
  const home = insertFolder(tx, 'Home');
  tx.update('folders', work, { color: 'blue' });
  tx.update('folders', home, { color: 'orange' });
  const folders = { top: null, work, home };

  const inbox = insertList(tx, { type: 'todo', title: 'Inbox', color: 'blue' });
  const groceries = insertList(tx, { type: 'grocery', title: 'Groceries', color: 'green' });
  const habits = insertList(tx, { type: 'habit', title: 'Habits', color: 'purple' });
  const website = insertList(tx, {
    type: 'todo',
    title: 'Website relaunch',
    folderId: work,
    color: 'indigo',
  });
  const team = insertList(tx, { type: 'todo', title: 'Team', folderId: work, color: 'teal' });
  const house = insertList(tx, { type: 'todo', title: 'House', folderId: home, color: 'amber' });
  const trip = insertList(tx, {
    type: 'todo',
    title: 'Lisbon trip',
    folderId: home,
    color: 'pink',
  });
  const dinner = insertList(tx, {
    type: 'grocery',
    title: 'Dinner party',
    folderId: home,
    color: 'red',
  });
  tx.update('lists', website, { pinned: true });

  for (const task of INBOX) addTask(inbox, task);
  addSections(website, WEBSITE);
  for (const task of TEAM) addTask(team, task);
  addSections(house, HOUSE);
  addSections(trip, TRIP);
  addGroceries(groceries, GROCERIES);
  addGroceries(dinner, DINNER_PARTY);

  for (const [title, where, content] of NOTES) {
    const id = insertList(tx, { type: 'note', title, folderId: folders[where] });
    tx.update('notes', id, {
      content: JSON.stringify(content),
      plainText: docToPlainText(content),
    });
  }

  // One archived list and one in the Trash.
  const planning = insertList(tx, { type: 'todo', title: 'Q3 planning', folderId: work });
  for (const task of PLANNING) addTask(planning, task);
  tx.update('lists', planning, { archivedAt: moment(55) });
  const old = insertList(tx, { type: 'todo', title: 'Old ideas' });
  for (const t of ['Start a podcast', 'Learn the banjo', 'Build a shed']) addTask(old, { text: t });
  tx.update('lists', old, { deletedAt: moment(2) });

  // A year of repeating tasks behind the ones above, for Completed and the statistics.

  const workdays = (rate: number, days: Weekday[] = WEEKDAYS) =>
    every(1, 1).filter((ago) => days.includes(weekdayAgo(ago)) && rand() < rate);
  addCompletions('Plan the day', workdays(0.85));
  addCompletions('Review pull requests', workdays(0.8, [1, 3, 5]));
  addCompletions('Weekly status update', every(5, 7, 0.9));
  addCompletions('1:1 with Sam', every(5, 7, 0.85));
  addCompletions('Team retro', every(10, 14));
  addCompletions('Submit expenses', every(34, 30));
  addCompletions('Water the plants', every(3, 3, 0.9));
  addCompletions('Take out the recycling', every(6, 7));
  addCompletions('Clean the bathroom', every(8, 7, 0.8));
  addCompletions('Change the bed sheets', every(9, 14));

  // Habits

  for (const habit of HABITS) {
    const id = insertItem(tx, habits, { text: habit.text });
    tx.update('items', id, { habit: habit.goal });
    for (let ago = HISTORY_DAYS; ago >= 0; ago--) {
      const checked =
        ago === 0
          ? habit.today
          : habit.goal.period === 'day' && ago <= habit.streak
            ? true
            : rand() < habit.rate;
      if (!checked) continue;
      tx.put('checkIns', { id: newId(), itemId: id, day: day(-ago), createdAt: moment(ago) });
    }
  }

  // Focus sessions: a few Pomodoros on most working days of the last two months.

  for (let ago = 60; ago >= 0; ago--) {
    const weekend = [0, 6].includes(weekdayAgo(ago));
    const count = Math.floor(rand() * (weekend ? 1.4 : 5));
    let startedAt = toTimestamp(day(-ago), '09:15') + Math.floor(rand() * 45) * 60_000;
    for (let n = 0; n < count; n++) {
      const pomodoro = rand() < 0.75;
      const seconds = pomodoro ? 25 * 60 : 300 + Math.floor(rand() * 3000);
      const endedAt = startedAt + (seconds + Math.floor(rand() * 120)) * 1000;
      if (endedAt > nowMs) break;
      tx.put('focusSessions', {
        id: newId(),
        itemId: byText.get(FOCUSED[Math.floor(rand() * FOCUSED.length)])!,
        kind: pomodoro ? 'pomodoro' : 'stopwatch',
        startedAt,
        endedAt,
        seconds,
      });
      startedAt = endedAt + (10 + Math.floor(rand() * 60)) * 60_000;
    }
  }

  // Filters

  for (const [name, query, color] of FILTERS) {
    const filters = tx.all('filters').sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    tx.put('filters', {
      id: newId(),
      name,
      query,
      color,
      sortKey: keyAt(filters, filters.length),
      createdAt: tx.now,
      updatedAt: tx.now,
    });
  }

  return inbox;
}

/**
 * Fills a brand-new data set with the sample data, in place of the starter
 * content. Does nothing (and returns false) once anything has been set up.
 */
export function seedSampleData(now: Date = new Date()): boolean {
  const { settings, tables } = useData.getState();
  if (settings.seeded) return false;
  if (Object.keys(tables.lists).length || Object.keys(tables.folders).length) return false;
  const inbox = commit('Sample data', (tx) => insertSampleData(tx, now), { undoable: false });
  setSetting('defaultListId', inbox);
  setSetting('seeded', true);
  return true;
}

/** Throws everything away and makes the sample data again, dated from today. Settings are kept. */
export async function resetSampleData(now: Date = new Date()): Promise<void> {
  const { settings } = useData.getState();
  await replaceData({
    tables: emptyTables(),
    // View options are per list, and the lists are new.
    settings: { ...settings, seeded: false, defaultListId: null, viewOptions: {} },
  });
  seedSampleData(now);
}
