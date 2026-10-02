export type ListType = 'todo' | 'grocery' | 'note';

export const COLOR_NAMES = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'gray',
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/** The colour schemes, shared with another project. Their colours are in styles/index.css. */
export const PALETTE_NAMES = ['graphite', 'stone', 'sage', 'midnight', 'dusk'] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

/** Priority 1 is the most urgent. 0 means no priority. */
export type Priority = 0 | 1 | 2 | 3;

export interface Folder {
  id: string;
  name: string;
  color: ColorName | null;
  sortKey: string;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface List {
  id: string;
  folderId: string | null;
  type: ListType;
  title: string;
  color: ColorName | null;
  pinned: boolean;
  sortKey: string;
  showCompleted: boolean;
  archivedAt: number | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Every N days/weeks/months/years. At least 1. */
  interval: number;
  /** For weekly rules on a schedule: the days it falls on. Empty means the due date's weekday. */
  weekdays?: Weekday[];
  /**
   * `schedule`: the next date follows the calendar (every Monday).
   * `completion`: the next date is counted from when it was finished (3 days after).
   */
  mode: 'schedule' | 'completion';
}

export interface Item {
  id: string;
  listId: string;
  parentId: string | null;
  text: string;
  checked: boolean;
  /** Closed without being done. Only meaningful with `checked`. */
  wontDo: boolean;
  completedAt: number | null;
  sortKey: string;
  /**
   * The section this task sits in, or null. Only top-level tasks carry one; a
   * subtask's is always null and it belongs wherever its top-level ancestor is.
   * One that names a missing section (or one in another list) means no section.
   */
  sectionId: string | null;
  /**
   * The labels on this task, in the order they were added. Only to-do tasks carry
   * any. An id that names a missing label is ignored.
   */
  labelIds: string[];
  /** Subtasks hidden. */
  collapsed: boolean;
  /** Rich-text notes as TipTap JSON, or null. */
  details: string | null;
  /** Local calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  /** Local time, HH:mm. Only set when dueDate is. */
  dueTime: string | null;
  /** Local time, HH:mm, strictly after `dueTime`. Only set when `dueTime` is. */
  endTime: string | null;
  /**
   * Local calendar date, YYYY-MM-DD. When the task must be finished, apart from
   * the due date (when you plan to do it). Independent of the due date.
   */
  deadline: string | null;
  priority: Priority;
  recurrence: Recurrence | null;
  /** Grocery: free text such as "2" or "500 g". */
  quantity: string | null;
  /** Grocery: a category id from settings. */
  category: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** A heading inside a to-do list that groups its top-level tasks. */
export interface Section {
  id: string;
  listId: string;
  title: string;
  sortKey: string;
  /** The section's tasks are hidden. */
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A tag that cuts across lists. Names are unique ignoring case. */
export interface Label {
  id: string;
  name: string;
  color: ColorName | null;
  sortKey: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A saved search over every to-do list, kept in the sidebar. `query` is in
 * the small language of `lib/filterQuery.ts` ("p1 & overdue", "#Work & @home").
 */
export interface Filter {
  id: string;
  name: string;
  query: string;
  color: ColorName | null;
  sortKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface Reminder {
  id: string;
  itemId: string;
  /** `relative` is measured back from the due date/time; `absolute` is a fixed moment. */
  kind: 'relative' | 'absolute';
  offsetMinutes: number | null;
  at: number | null;
  /** The fire time this reminder was last delivered for. */
  firedFor: number | null;
  /** The fire time the user last dismissed. */
  dismissedFor: number | null;
  snoozedUntil: number | null;
  /** Keeps notifying every few minutes after it fires, until dealt with. */
  constant: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A finished occurrence of a recurring task. */
export interface Completion {
  id: string;
  itemId: string;
  dueDate: string | null;
  completedAt: number;
}

/** Body of a note list. `id` is the list's id. */
export interface Note {
  id: string;
  content: string;
  plainText: string;
  updatedAt: number;
}

export type FocusKind = 'pomodoro' | 'stopwatch';

/** Time spent on a task with the focus timer, logged when the timer stops. */
export interface FocusSession {
  id: string;
  itemId: string;
  kind: FocusKind;
  /** When the timer was started, ms. */
  startedAt: number;
  /** When it stopped, ms. */
  endedAt: number;
  /** Seconds actually focused: the span without the pauses. At least 1. */
  seconds: number;
}

export interface Tables {
  folders: Record<string, Folder>;
  lists: Record<string, List>;
  items: Record<string, Item>;
  sections: Record<string, Section>;
  labels: Record<string, Label>;
  filters: Record<string, Filter>;
  reminders: Record<string, Reminder>;
  completions: Record<string, Completion>;
  notes: Record<string, Note>;
  focusSessions: Record<string, FocusSession>;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T][string];
export type AnyRow = Row<TableName>;

export const TABLE_NAMES: TableName[] = [
  'folders',
  'lists',
  'items',
  'sections',
  'labels',
  'filters',
  'reminders',
  'completions',
  'notes',
  'focusSessions',
];

export function emptyTables(): Tables {
  return {
    folders: {},
    lists: {},
    items: {},
    sections: {},
    labels: {},
    filters: {},
    reminders: {},
    completions: {},
    notes: {},
    focusSessions: {},
  };
}

export interface GroceryCategory {
  id: string;
  name: string;
}

/** The built-in views the sidebar can hide. */
export const BUILT_IN_VIEWS = [
  'today',
  'tomorrow',
  'next7',
  'upcoming',
  'calendar',
  'matrix',
  'reminders',
] as const;
export type BuiltInView = (typeof BUILT_IN_VIEWS)[number];

/** The calendar's layouts: a month grid, a week, or three days. */
export const CALENDAR_LAYOUTS = ['month', 'week', 'days'] as const;
export type CalendarLayout = (typeof CALENDAR_LAYOUTS)[number];

/** How a view orders its tasks. `manual` is the list's own order (a smart view treats it as `date`). */
export const SORT_KEYS = ['manual', 'date', 'priority', 'name', 'added'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** How a view groups its tasks. `default` is the view's own grouping (days in Upcoming, sections in a list). */
export const GROUP_KEYS = [
  'default',
  'none',
  'date',
  'priority',
  'list',
  'label',
  'section',
] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

/** A view's sort and grouping, kept per view in `Settings.viewOptions`. */
export interface ViewOptions {
  sort: SortKey;
  group: GroupKey;
}

/** The two searches the Eisenhower matrix is built from. */
export interface MatrixSettings {
  urgent: string;
  important: string;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** The colour scheme, independent of the light/dark theme. */
  palette: PaletteName;
  /** Closing the window keeps the app running in the tray. */
  closeToTray: boolean;
  /** Read dates, repeats and priority out of quick-add text. */
  parseDates: boolean;
  weekStartsOn: 0 | 1;
  /** Which layout the Calendar view shows. */
  calendarLayout: CalendarLayout;
  /** When reminders for all-day tasks fire, HH:mm. */
  allDayReminderTime: string;
  /** Where quick-add puts tasks from Today and Upcoming. */
  defaultListId: string | null;
  groceryCategories: GroceryCategory[];
  backupsEnabled: boolean;
  lastBackupAt: number | null;
  /** Set once the welcome content has been created. */
  seeded: boolean;
  /** The sidebar is tucked away; the main pane shows a button to bring it back. */
  sidebarHidden: boolean;
  /** Built-in views left out of the sidebar. They stay reachable from the palette and shortcuts. */
  hiddenViews: BuiltInView[];
  /** When the "Plan your day" reminder goes off, HH:mm. Null is off. */
  dailyReviewTime: string | null;
  /**
   * Sort and grouping per view, by view key (`today`, `list:<id>`, `label:<id>`,
   * `filter:<id>`). A view that isn't here uses its defaults.
   */
  viewOptions: Record<string, ViewOptions>;
  /** What counts as urgent and as important in the Eisenhower matrix. */
  matrix: MatrixSettings;
  /** Length of a Pomodoro, in minutes. */
  focusMinutes: number;
  /** Length of a break, in minutes. */
  breakMinutes: number;
}

export const DEFAULT_MATRIX: MatrixSettings = { urgent: 'overdue | today', important: 'p1 | p2' };

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;
export const MAX_FOCUS_MINUTES = 180;
export const MAX_BREAK_MINUTES = 60;

export const DEFAULT_GROCERY_CATEGORIES: GroceryCategory[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'meat', name: 'Meat & seafood' },
  { id: 'dairy', name: 'Dairy & eggs' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'pantry', name: 'Pantry' },
  { id: 'snacks', name: 'Snacks' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'household', name: 'Household' },
  { id: 'personal', name: 'Personal care' },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  palette: 'graphite',
  closeToTray: true,
  parseDates: true,
  weekStartsOn: 1,
  calendarLayout: 'month',
  allDayReminderTime: '09:00',
  defaultListId: null,
  groceryCategories: DEFAULT_GROCERY_CATEGORIES,
  backupsEnabled: true,
  lastBackupAt: null,
  seeded: false,
  sidebarHidden: false,
  hiddenViews: [],
  dailyReviewTime: null,
  viewOptions: {},
  matrix: DEFAULT_MATRIX,
  focusMinutes: DEFAULT_FOCUS_MINUTES,
  breakMinutes: DEFAULT_BREAK_MINUTES,
};

/** A complete copy of the data, used for export, import and backups. */
export interface Snapshot {
  app: 'checklist';
  version: 1;
  exportedAt: number;
  tables: { [T in TableName]: Row<T>[] };
  settings: Partial<Settings>;
}
