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
  completedAt: number | null;
  sortKey: string;
  /** Subtasks hidden. */
  collapsed: boolean;
  /** Rich-text notes as TipTap JSON, or null. */
  details: string | null;
  /** Local calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  /** Local time, HH:mm. Only set when dueDate is. */
  dueTime: string | null;
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

export interface Tables {
  folders: Record<string, Folder>;
  lists: Record<string, List>;
  items: Record<string, Item>;
  reminders: Record<string, Reminder>;
  completions: Record<string, Completion>;
  notes: Record<string, Note>;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T][string];
export type AnyRow = Row<TableName>;

export const TABLE_NAMES: TableName[] = [
  'folders',
  'lists',
  'items',
  'reminders',
  'completions',
  'notes',
];

export function emptyTables(): Tables {
  return { folders: {}, lists: {}, items: {}, reminders: {}, completions: {}, notes: {} };
}

export interface GroceryCategory {
  id: string;
  name: string;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** Closing the window keeps the app running in the tray. */
  closeToTray: boolean;
  /** Read dates, repeats and priority out of quick-add text. */
  parseDates: boolean;
  weekStartsOn: 0 | 1;
  /** When reminders for all-day tasks fire, HH:mm. */
  allDayReminderTime: string;
  /** Where quick-add puts tasks from Today and Upcoming. */
  defaultListId: string | null;
  groceryCategories: GroceryCategory[];
  backupsEnabled: boolean;
  lastBackupAt: number | null;
  /** Set once the welcome content has been created. */
  seeded: boolean;
}

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
  closeToTray: true,
  parseDates: true,
  weekStartsOn: 1,
  allDayReminderTime: '09:00',
  defaultListId: null,
  groceryCategories: DEFAULT_GROCERY_CATEGORIES,
  backupsEnabled: true,
  lastBackupAt: null,
  seeded: false,
};

/** A complete copy of the data, used for export, import and backups. */
export interface Snapshot {
  app: 'checklist';
  version: 1;
  exportedAt: number;
  tables: { [T in TableName]: Row<T>[] };
  settings: Partial<Settings>;
}
