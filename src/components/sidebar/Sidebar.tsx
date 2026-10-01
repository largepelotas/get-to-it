import clsx from 'clsx';
import {
  Archive,
  Bell,
  CalendarDays,
  CalendarRange,
  Ellipsis,
  FolderPlus,
  Keyboard,
  Monitor,
  Moon,
  PanelLeftClose,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Sunrise,
  Trash,
  TriangleAlert,
} from 'lucide-react';
import { useMemo } from 'react';
import { newFolder, toggleSidebar } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import { listMenuEntries } from '@/components/menus';
import { Button, ContextMenu, IconButton, Menu, Tooltip, type MenuEntries } from '@/components/ui';
import type { BuiltInView, Settings } from '@/data/types';
import { SHORTCUTS } from '@/lib/keymap';
import { useReminderEntries } from '@/hooks/useReminders';
import { useToday } from '@/hooks/useToday';
import { colorVar } from '@/lib/theme';
import { isMac } from '@/platform';
import { renameList } from '@/store/actions/lists';
import { setSetting, useData } from '@/store/data';
import { openCounts, sidebarModel } from '@/store/sidebar';
import { dueRows, next7Count, todayCount, tomorrowCount } from '@/store/smart';
import { navigate, openDialog, openList, startRename, stopRename, useUI } from '@/store/ui';
import { LabelList } from './LabelList';
import { ListTree } from './ListTree';
import { RenameField } from './RenameField';
import { SectionHeader, SidebarItem } from './SidebarItem';

const navIcon = 'size-4 shrink-0';

const THEMES: { value: Settings['theme']; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

function settingsEntries(theme: Settings['theme']): MenuEntries {
  return [
    { kind: 'label', label: 'Appearance' },
    ...THEMES.map((t) => ({
      label: t.label,
      icon: <t.icon className="size-3.5" />,
      checked: theme === t.value,
      onSelect: () => setSetting('theme', t.value),
    })),
    { kind: 'separator' },
    {
      label: 'Hide sidebar',
      icon: <PanelLeftClose className="size-3.5" />,
      shortcut: SHORTCUTS.toggleSidebar,
      movesFocus: true,
      onSelect: toggleSidebar,
    },
    {
      label: 'Settings…',
      icon: <SettingsIcon className="size-3.5" />,
      shortcut: SHORTCUTS.settings,
      onSelect: () => openDialog({ kind: 'settings' }),
    },
    {
      label: 'Keyboard shortcuts',
      icon: <Keyboard className="size-3.5" />,
      shortcut: SHORTCUTS.help,
      onSelect: () => openDialog({ kind: 'shortcuts' }),
    },
  ];
}

export function Sidebar() {
  const lists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  const items = useData((s) => s.tables.items);
  const theme = useData((s) => s.settings.theme);
  const saveError = useData((s) => s.saveError);
  const view = useUI((s) => s.view);
  const renaming = useUI((s) => s.renaming);

  const model = useMemo(() => sidebarModel({ lists, folders }), [lists, folders]);
  const counts = useMemo(() => openCounts(items), [items]);
  const today = useToday();
  const counted = useMemo(() => {
    const rows = dueRows(items, lists);
    return {
      today: todayCount(rows, today),
      tomorrow: tomorrowCount(rows, today),
      next7: next7Count(rows, today),
    };
  }, [items, lists, today]);
  const reminded = useReminderEntries().inbox.length;
  const hiddenViews = useData((s) => s.settings.hiddenViews);
  // A hidden view stays hidden, except Reminders while some are waiting, so none get stranded.
  const shows = (name: BuiltInView) =>
    !hiddenViews.includes(name) || (name === 'reminders' && reminded > 0);

  return (
    <aside
      data-region="sidebar"
      aria-label="Sidebar"
      className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-sidebar"
    >
      {/* Room for the macOS traffic lights, and somewhere to drag the window. */}
      <div data-tauri-drag-region className={clsx('shrink-0', isMac ? 'h-11' : 'h-3')} />

      <nav aria-label="Lists" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shows('today') && (
          <SidebarItem
            icon={<Sun className={navIcon} style={{ color: colorVar('amber') }} />}
            label="Today"
            count={counted.today}
            active={view.kind === 'today'}
            onClick={() => navigate({ kind: 'today' })}
          />
        )}
        {shows('tomorrow') && (
          <SidebarItem
            icon={<Sunrise className={navIcon} style={{ color: colorVar('orange') }} />}
            label="Tomorrow"
            count={counted.tomorrow}
            active={view.kind === 'tomorrow'}
            onClick={() => navigate({ kind: 'tomorrow' })}
          />
        )}
        {shows('next7') && (
          <SidebarItem
            icon={<CalendarRange className={navIcon} style={{ color: colorVar('green') }} />}
            label="Next 7 days"
            count={counted.next7}
            active={view.kind === 'next7'}
            onClick={() => navigate({ kind: 'next7' })}
          />
        )}
        {shows('upcoming') && (
          <SidebarItem
            icon={<CalendarDays className={navIcon} style={{ color: colorVar('red') }} />}
            label="Upcoming"
            active={view.kind === 'upcoming'}
            onClick={() => navigate({ kind: 'upcoming' })}
          />
        )}
        {shows('reminders') && (
          <SidebarItem
            icon={<Bell className={navIcon} style={{ color: colorVar('purple') }} />}
            label="Reminders"
            count={reminded}
            active={view.kind === 'reminders'}
            onClick={() => navigate({ kind: 'reminders' })}
          />
        )}

        {model.pinned.length > 0 && (
          <>
            <SectionHeader label="Pinned" />
            {model.pinned.map((list) => {
              const isRenaming =
                renaming?.kind === 'list' && renaming.id === list.id && renaming.pinned;
              return (
                <ContextMenu
                  key={list.id}
                  entries={() =>
                    listMenuEntries(list, {
                      onRename: () => startRename({ kind: 'list', id: list.id, pinned: true }),
                    })
                  }
                >
                  <SidebarItem
                    icon={<ListIcon type={list.type} color={list.color} />}
                    label={list.title}
                    count={counts.get(list.id)}
                    active={view.kind === 'list' && view.listId === list.id}
                    onClick={() => openList(list.id)}
                    editor={
                      isRenaming ? (
                        <RenameField
                          initial={list.title}
                          label="List name"
                          onCommit={(title) => renameList(list.id, title)}
                          onDone={stopRename}
                        />
                      ) : undefined
                    }
                  />
                </ContextMenu>
              );
            })}
          </>
        )}

        <SectionHeader label="Lists">
          <IconButton
            size="sm"
            label="New folder"
            icon={<FolderPlus className="size-3.5" />}
            onClick={newFolder}
          />
          <IconButton
            size="sm"
            label="New list"
            icon={<Plus className="size-4" />}
            onClick={() => openDialog({ kind: 'newList', folderId: null })}
          />
        </SectionHeader>
        <ListTree model={model} counts={counts} />

        <LabelList />
      </nav>

      <div className="shrink-0 border-t border-line px-2 py-2">
        <SidebarItem
          icon={<Archive className={clsx(navIcon, 'text-fg-muted')} />}
          label="Archive"
          count={model.archived.length}
          active={view.kind === 'archive'}
          onClick={() => navigate({ kind: 'archive' })}
        />
        <SidebarItem
          icon={<Trash className={clsx(navIcon, 'text-fg-muted')} />}
          label="Trash"
          count={model.trashed.length}
          active={view.kind === 'trash'}
          onClick={() => navigate({ kind: 'trash' })}
        />
        <div className="mt-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-fg-muted"
            onClick={() => openDialog({ kind: 'newList', folderId: null })}
          >
            <Plus className="size-4" />
            New list
          </Button>
          {saveError && (
            <Tooltip content={`Couldn’t save changes: ${saveError}`}>
              <span
                role="img"
                aria-label="Couldn’t save changes"
                className="flex size-7 items-center justify-center text-danger"
              >
                <TriangleAlert className="size-4" />
              </span>
            </Tooltip>
          )}
          <IconButton
            label="Hide sidebar"
            shortcut={SHORTCUTS.toggleSidebar}
            icon={<PanelLeftClose className="size-4" />}
            onClick={toggleSidebar}
          />
          <Menu
            side="top"
            align="end"
            entries={() => settingsEntries(theme)}
            trigger={<IconButton label="Settings" icon={<Ellipsis className="size-4" />} />}
          />
        </div>
      </div>
    </aside>
  );
}
