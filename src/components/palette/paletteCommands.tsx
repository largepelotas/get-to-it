import {
  Archive,
  Bell,
  CalendarDays,
  ClipboardCopy,
  Download,
  FileDown,
  FolderOpen,
  FolderPlus,
  HardDriveDownload,
  Keyboard,
  Monitor,
  Moon,
  Plus,
  Redo2,
  Settings as SettingsIcon,
  Sun,
  Trash,
  Trash2,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { confirmEmptyTrash, copyAsMarkdown, newFolder, redoCommand, undoCommand } from '@/commands';
import { backUpNow, exportJson, exportMarkdown, importJson, showBackups } from '@/dataCommands';
import type { Settings, Tables } from '@/data/types';
import { focusQuickAdd } from '@/hooks/useAppShortcuts';
import { SHORTCUTS } from '@/lib/keymap';
import { canBackUp } from '@/platform';
import { queryTerms, scoreText } from '@/store/search';
import { setSetting } from '@/store/data';
import { navigate, openDialog, type View } from '@/store/ui';

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
  tables: Pick<Tables, 'lists'>;
  theme: Settings['theme'];
  undoLabel: string | null;
  redoLabel: string | null;
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
  undoLabel,
  redoLabel,
}: PaletteContext): PaletteCommand[] {
  const list = view.kind === 'list' ? tables.lists[view.listId] : undefined;
  const editable = list && !list.deletedAt && !list.archivedAt;
  const hasQuickAdd =
    view.kind === 'today' || view.kind === 'upcoming' || (editable && list.type !== 'note');
  const hasTrash = Object.values(tables.lists).some((l) => l.deletedAt);
  const goTo = (target: View['kind'], label: string, icon: LucideIcon, shortcut?: string) =>
    view.kind !== target && {
      id: `go-${target}`,
      label: `Go to ${label}`,
      icon,
      shortcut,
      run: () => navigate({ kind: target } as View),
    };

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
    goTo('today', 'Today', CalendarDays, SHORTCUTS.today),
    goTo('upcoming', 'Upcoming', CalendarDays, SHORTCUTS.upcoming),
    goTo('reminders', 'Reminders', Bell, SHORTCUTS.reminders),
    goTo('archive', 'Archive', Archive),
    goTo('trash', 'Trash', Trash),
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
    ...THEMES.filter((t) => t.value !== theme).map((t): PaletteCommand => ({
      id: `theme-${t.value}`,
      label: `Use ${t.label.toLowerCase()} theme`,
      keywords: 'appearance mode colour color',
      icon: t.icon,
      keepsFocus: true,
      run: () => setSetting('theme', t.value),
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
