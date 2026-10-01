import type { Shortcut } from './shortcuts';

/** App-wide shortcuts, handled in `useAppShortcuts`. */
export const SHORTCUTS = {
  palette: 'Mod+K',
  search: 'Mod+F',
  newTask: 'Mod+N',
  quickAddDialog: 'Mod+Shift+A',
  newList: 'Mod+Shift+N',
  today: 'Mod+1',
  upcoming: 'Mod+2',
  reminders: 'Mod+3',
  copyMarkdown: 'Mod+Shift+C',
  settings: 'Mod+,',
  help: 'Mod+/',
  toggleSidebar: 'Mod+\\',
  /** Move between the sidebar, the open view and the details panel. */
  nextRegion: 'F6',
  previousRegion: 'Shift+F6',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  /** On a task: open the due-date picker. */
  dueDate: 'Mod+D',
  /** On a task: show or hide its details. */
  details: 'Mod+I',
} satisfies Record<string, Shortcut>;

export interface ShortcutHelp {
  keys: Shortcut[];
  label: string;
}

/** Everything listed in the Keyboard shortcuts dialog, by section. */
export const SHORTCUT_HELP: { title: string; entries: ShortcutHelp[] }[] = [
  {
    title: 'Everywhere',
    entries: [
      { keys: [SHORTCUTS.palette], label: 'Search and run commands' },
      { keys: [SHORTCUTS.newTask], label: 'Add a task or item to the open list (or any list)' },
      { keys: [SHORTCUTS.quickAddDialog], label: 'Add a task to any list' },
      { keys: [SHORTCUTS.newList], label: 'New list' },
      { keys: [SHORTCUTS.today], label: 'Go to Today' },
      { keys: [SHORTCUTS.upcoming], label: 'Go to Upcoming' },
      { keys: [SHORTCUTS.reminders], label: 'Go to Reminders' },
      { keys: [SHORTCUTS.copyMarkdown], label: 'Copy the open list as Markdown' },
      {
        keys: [SHORTCUTS.nextRegion, SHORTCUTS.previousRegion],
        label: 'Move between the sidebar, the list and the details',
      },
      { keys: ['Shift+F10'], label: 'Open the menu of the focused row' },
      { keys: [SHORTCUTS.undo], label: 'Undo' },
      { keys: [SHORTCUTS.redo], label: 'Redo' },
      { keys: [SHORTCUTS.toggleSidebar], label: 'Hide or show the sidebar' },
      { keys: [SHORTCUTS.settings], label: 'Settings' },
      { keys: [SHORTCUTS.help], label: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'Tasks',
    entries: [
      { keys: ['ArrowUp', 'ArrowDown'], label: 'Select the task above or below' },
      { keys: ['Enter'], label: 'Edit the task, or add one below while editing' },
      { keys: ['Space', 'E', 'Mod+Enter'], label: 'Complete' },
      { keys: ['Tab', 'Shift+Tab'], label: 'Make a subtask, or move it back out' },
      { keys: ['Alt+ArrowUp', 'Alt+ArrowDown'], label: 'Move up or down' },
      { keys: [SHORTCUTS.details], label: 'Show or hide details' },
      { keys: [SHORTCUTS.dueDate, 'T'], label: 'Set the due date' },
      { keys: ['1', '2', '3', '4'], label: 'Set priority 1, 2 or 3, or none' },
      { keys: ['V'], label: 'Move to another list' },
      { keys: ['Shift+A'], label: 'Add a task at the top of the list' },
      {
        keys: ['Mod+Click', 'Shift+Click', 'Shift+ArrowUp', 'Shift+ArrowDown', 'Mod+A'],
        label: 'Select several tasks, then complete, reschedule, move or delete them together',
      },
      { keys: ['Delete'], label: 'Delete' },
      { keys: ['Escape'], label: 'Stop editing, then clear the selection' },
    ],
  },
  {
    title: 'Grocery lists',
    entries: [
      { keys: ['Space'], label: 'Put in the cart, or take out' },
      { keys: ['Enter'], label: 'Edit the name' },
      { keys: ['Tab'], label: 'From the name to the quantity' },
      { keys: ['Alt+ArrowUp', 'Alt+ArrowDown'], label: 'Move within the category' },
    ],
  },
  {
    title: 'Notes',
    entries: [
      { keys: ['Mod+B', 'Mod+I', 'Mod+U'], label: 'Bold, italic, underline' },
      { keys: ['Mod+Alt+1', 'Mod+Alt+2', 'Mod+Alt+3'], label: 'Headings' },
      { keys: ['Mod+Shift+8', 'Mod+Shift+7'], label: 'Bulleted or numbered list' },
      { keys: ['Mod+Shift+9'], label: 'Checklist' },
      { keys: ['Mod+Click'], label: 'Open a link' },
    ],
  },
];
