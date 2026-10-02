import {
  Archive,
  Bell,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Check,
  CircleCheck,
  ClipboardCopy,
  Columns3,
  Coffee,
  Download,
  FileDown,
  FolderOpen,
  FolderPlus,
  Funnel,
  LayoutGrid,
  HardDriveDownload,
  Keyboard,
  List as ListIcon,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Settings as SettingsIcon,
  Square,
  Sun,
  Sunrise,
  Tag,
  Trash,
  Trash2,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import {
  confirmEmptyTrash,
  setViewOptions,
  copyAsMarkdown,
  newFilter,
  newFolder,
  completeFocusedTask,
  newLabel,
  pauseFocus,
  redoCommand,
  resumeFocus,
  startBreak,
  stopFocus,
  toggleSidebar,
  undoCommand,
} from '@/commands';
import { backUpNow, exportJson, exportMarkdown, importJson, showBackups } from '@/dataCommands';
import type { Settings, Tables } from '@/data/types';
import type { FocusTimer } from '@/lib/focus';
import { focusQuickAdd } from '@/hooks/useAppShortcuts';
import { SHORTCUTS } from '@/lib/keymap';
import { PALETTES } from '@/lib/theme';
import { canBackUp } from '@/platform';
import { sortedFilters } from '@/store/filters';
import { sortedLabels } from '@/store/labels';
import { queryTerms, scoreText } from '@/store/search';
import { setSetting } from '@/store/data';
import { viewKey, viewOptionsFor } from '@/store/viewOptions';
import { navigate, openDialog, openFilter, openLabel, type View } from '@/store/ui';

export interface PaletteCommand {
  id: string;
  label: string;
  /** Other words it can be found by. */
  keywords?: string;
  /**
   * What it's found by, when the label has words that aren't the command's
   * own (a list title), so searching for the list doesn't bring it up.
   */
  matchLabel?: string;
  icon: LucideIcon;
  shortcut?: string;
  /** Runs once the palette has closed. */
  run: () => void;
  /** The command doesn't move focus, so it goes back where it was. */
  keepsFocus?: boolean;
}

export interface PaletteContext {
  view: View;
  tables: Pick<Tables, 'lists'> & Partial<Pick<Tables, 'labels' | 'filters'>>;
  theme: Settings['theme'];
  palette: Settings['palette'];
  sidebarHidden: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  timer: FocusTimer | null;
  /** The view's options as saved, for the layout command. */
  viewOptions: Settings['viewOptions'];
}

const THEMES: { value: Settings['theme']; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Every command that makes sense right now, in the order they're offered. */
export function paletteCommands({
  view,
  tables,
  theme,
  palette,
  sidebarHidden,
  undoLabel,
  redoLabel,
  timer,
  viewOptions,
}: PaletteContext): PaletteCommand[] {
  const list = view.kind === 'list' ? tables.lists[view.listId] : undefined;
  const editable = list && !list.deletedAt && !list.archivedAt;
  const hasQuickAdd =
    view.kind === 'today' ||
    view.kind === 'tomorrow' ||
    view.kind === 'next7' ||
    view.kind === 'upcoming' ||
    view.kind === 'matrix' ||
    view.kind === 'label' ||
    view.kind === 'filter' ||
    (editable && list.type !== 'note');
  const hasTrash = Object.values(tables.lists).some((l) => l.deletedAt);
  const goTo = (target: View['kind'], label: string, icon: LucideIcon, shortcut?: string) =>
    view.kind !== target && {
      id: `go-${target}`,
      label: `Go to ${label}`,
      icon,
      shortcut,
      run: () => navigate({ kind: target } as View),
    };

  const key = viewKey(view);
  const options = viewOptionsFor({ viewOptions }, view);
  const layout = options.layout;

  const commands: (PaletteCommand | false | undefined)[] = [
    hasQuickAdd && {
      id: 'new-task',
      label: list?.type === 'grocery' ? 'New item' : 'New task',
      keywords: 'add create',
      icon: Plus,
      shortcut: SHORTCUTS.newTask,
      run: () => void focusQuickAdd(),
    },
    {
      id: 'quick-add',
      label: 'Add a task to…',
      keywords: 'new create quick list',
      icon: Plus,
      shortcut: SHORTCUTS.quickAddDialog,
      run: () => openDialog({ kind: 'quickAdd' }),
    },
    {
      id: 'new-list',
      label: 'New list…',
      keywords: 'add create note grocery todo',
      icon: Plus,
      shortcut: SHORTCUTS.newList,
      run: () => openDialog({ kind: 'newList', folderId: null }),
    },
    {
      id: 'new-folder',
      label: 'New folder',
      keywords: 'add create',
      icon: FolderPlus,
      run: newFolder,
    },
    {
      id: 'new-label',
      label: 'New label',
      keywords: 'add create tag',
      icon: Tag,
      run: newLabel,
    },
    {
      id: 'new-filter',
      label: 'New filter…',
      keywords: 'add create search saved query',
      icon: Funnel,
      run: newFilter,
    },
    key !== null &&
      (view.kind !== 'list' || (editable && list.type === 'todo')) && {
        id: 'toggle-layout',
        label: layout === 'board' ? 'Show as list' : 'Show as board',
        keywords: 'kanban layout columns',
        icon: layout === 'board' ? ListIcon : Columns3,
        keepsFocus: true,
        run: () =>
          setViewOptions(view, { ...options, layout: layout === 'board' ? 'list' : 'board' }),
      },
    goTo('today', 'Today', CalendarDays, SHORTCUTS.today),
    goTo('tomorrow', 'Tomorrow', Sunrise),
    goTo('next7', 'Next 7 days', CalendarRange),
    goTo('upcoming', 'Upcoming', CalendarDays, SHORTCUTS.upcoming),
    goTo('calendar', 'Calendar', Calendar),
    goTo('matrix', 'Eisenhower matrix', LayoutGrid),
    goTo('completed', 'Completed', CircleCheck),
    goTo('stats', 'Statistics', ChartColumn),
    goTo('reminders', 'Reminders', Bell, SHORTCUTS.reminders),
    goTo('archive', 'Archive', Archive),
    goTo('trash', 'Trash', Trash),
    ...sortedLabels(tables.labels ?? {})
      .filter((l) => !(view.kind === 'label' && view.labelId === l.id))
      .map((l): PaletteCommand => ({
        id: `go-label-${l.id}`,
        label: `Go to label “${l.name}”`,
        matchLabel: `Go to label ${l.name}`,
        keywords: 'tag',
        icon: Tag,
        run: () => openLabel(l.id),
      })),
    ...sortedFilters(tables.filters ?? {})
      .filter((f) => !(view.kind === 'filter' && view.filterId === f.id))
      .map((f): PaletteCommand => ({
        id: `go-filter-${f.id}`,
        label: `Go to filter “${f.name}”`,
        matchLabel: `Go to filter ${f.name}`,
        keywords: 'search saved',
        icon: Funnel,
        run: () => openFilter(f.id),
      })),
    list && {
      id: 'copy-markdown',
      label: `Copy “${list.title}” as Markdown`,
      matchLabel: 'Copy as Markdown',
      keywords: 'clipboard',
      icon: ClipboardCopy,
      shortcut: SHORTCUTS.copyMarkdown,
      keepsFocus: true,
      run: () => void copyAsMarkdown(list.id),
    },
    undoLabel !== null && {
      id: 'undo',
      label: `Undo ${undoLabel.toLowerCase()}`,
      matchLabel: 'Undo',
      icon: Undo2,
      shortcut: SHORTCUTS.undo,
      keepsFocus: true,
      run: undoCommand,
    },
    redoLabel !== null && {
      id: 'redo',
      label: `Redo ${redoLabel.toLowerCase()}`,
      matchLabel: 'Redo',
      icon: Redo2,
      shortcut: SHORTCUTS.redo,
      keepsFocus: true,
      run: redoCommand,
    },
    {
      id: 'toggle-sidebar',
      label: sidebarHidden ? 'Show sidebar' : 'Hide sidebar',
      keywords: 'panel lists',
      icon: sidebarHidden ? PanelLeftOpen : PanelLeftClose,
      shortcut: SHORTCUTS.toggleSidebar,
      run: toggleSidebar,
    },
    !!timer &&
      timer.pausedAt === null && {
        id: 'focus-pause',
        label: 'Pause focus timer',
        keywords: 'pomodoro stopwatch',
        icon: Pause,
        keepsFocus: true,
        run: pauseFocus,
      },
    !!timer &&
      timer.pausedAt !== null && {
        id: 'focus-resume',
        label: 'Resume focus timer',
        keywords: 'pomodoro stopwatch continue',
        icon: Play,
        keepsFocus: true,
        run: resumeFocus,
      },
    !!timer && {
      id: 'focus-stop',
      label: 'Stop focus timer',
      keywords: 'pomodoro stopwatch end',
      icon: Square,
      keepsFocus: true,
      run: stopFocus,
    },
    !!timer &&
      timer.kind !== 'break' && {
        id: 'focus-complete',
        label: 'Complete the focused task',
        keywords: 'done finish pomodoro',
        icon: Check,
        run: completeFocusedTask,
      },
    !timer && {
      id: 'focus-break',
      label: 'Start a break',
      keywords: 'focus pomodoro rest',
      icon: Coffee,
      keepsFocus: true,
      run: startBreak,
    },
    ...THEMES.filter((t) => t.value !== theme).map((t): PaletteCommand => ({
      id: `theme-${t.value}`,
      label: `Use ${t.label.toLowerCase()} theme`,
      keywords: 'appearance mode colour color',
      icon: t.icon,
      keepsFocus: true,
      run: () => setSetting('theme', t.value),
    })),
    ...PALETTES.filter((p) => p.value !== palette).map((p): PaletteCommand => ({
      id: `palette-${p.value}`,
      label: `Use the ${p.label} colour scheme`,
      keywords: 'appearance theme palette colour color',
      icon: Palette,
      keepsFocus: true,
      run: () => setSetting('palette', p.value),
    })),
    {
      id: 'settings',
      label: 'Settings…',
      keywords: 'preferences options',
      icon: SettingsIcon,
      shortcut: SHORTCUTS.settings,
      run: () => openDialog({ kind: 'settings' }),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      keywords: 'keys help',
      icon: Keyboard,
      shortcut: SHORTCUTS.help,
      run: () => openDialog({ kind: 'shortcuts' }),
    },
    {
      id: 'export-json',
      label: 'Export data…',
      keywords: 'json save file',
      icon: Download,
      run: () => void exportJson(),
    },
    {
      id: 'import-json',
      label: 'Import data…',
      keywords: 'json open file restore',
      icon: Upload,
      run: () => void importJson(),
    },
    {
      id: 'export-markdown',
      label: 'Export as Markdown…',
      keywords: 'md files save',
      icon: FileDown,
      run: () => void exportMarkdown(),
    },
    canBackUp && {
      id: 'back-up',
      label: 'Back up now',
      keywords: 'backup save',
      icon: HardDriveDownload,
      keepsFocus: true,
      run: () => void backUpNow(),
    },
    canBackUp && {
      id: 'show-backups',
      label: 'Show backups',
      keywords: 'backup folder restore',
      icon: FolderOpen,
      keepsFocus: true,
      run: showBackups,
    },
    hasTrash && {
      id: 'empty-trash',
      label: 'Empty Trash…',
      keywords: 'delete forever',
      icon: Trash2,
      run: confirmEmptyTrash,
    },
  ];
  return commands.filter((c): c is PaletteCommand => !!c);
}

/**
 * How well a command matches the query (see `scoreText`), or null when it
 * doesn't. Every word of the query has to start a word of the command's
 * label or keywords; the label scores higher.
 */
export function commandScore(command: PaletteCommand, terms: string[]): number | null {
  const label = (command.matchLabel ?? command.label).replace(/[“”…]/g, ' ');
  const words = queryTerms(`${label} ${command.keywords ?? ''}`);
  if (!terms.every((term) => words.some((word) => word.startsWith(term)))) return null;
  return scoreText(label, terms) ?? 1;
}
