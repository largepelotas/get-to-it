import clsx from 'clsx';
import { PanelLeftOpen } from 'lucide-react';
import { useEffect } from 'react';
import { homeView, toggleSidebar } from '@/commands';
import { SHORTCUTS } from '@/lib/keymap';
import { isMac } from '@/platform';
import { useData } from '@/store/data';
import { navigate, useUI } from '@/store/ui';
import { FocusBar } from './focus/FocusBar';
import { CompletedView } from './views/CompletedView';
import { StatsView } from './views/StatsView';
import { FilterView } from './views/FilterView';
import { LabelView } from './views/LabelView';
import { ListView } from './views/ListView';
import { MatrixView } from './views/MatrixView';
import { RemindersView } from './views/RemindersView';
import { CalendarView } from './views/CalendarView';
import { Next7View, TodayView, TomorrowView, UpcomingView } from './views/SmartViews';
import { ArchiveView, TrashView } from './views/StoredLists';
import { IconButton } from './ui';

/**
 * The way back once the sidebar is hidden. On macOS it sits in its own strip
 * (which also drags the window) clear of the traffic lights, which the
 * sidebar's strip used to hold; elsewhere the strip is shorter. Either way it
 * pushes the view down, so the button never overlaps the view's header.
 */
function ShowSidebarButton() {
  const button = (
    <IconButton
      data-show-sidebar
      label="Show sidebar"
      shortcut={SHORTCUTS.toggleSidebar}
      icon={<PanelLeftOpen className="size-4" />}
      onClick={toggleSidebar}
    />
  );
  return (
    <div
      data-tauri-drag-region
      className={clsx('flex shrink-0 items-center', isMac ? 'h-11 pl-21' : 'h-9 pl-2')}
    >
      {button}
    </div>
  );
}

export function MainPane() {
  const view = useUI((s) => s.view);
  const listId = view.kind === 'list' ? view.listId : null;
  const listExists = useData((s) => (listId ? !!s.tables.lists[listId] : true));
  const labelId = view.kind === 'label' ? view.labelId : null;
  const labelExists = useData((s) => (labelId ? !!s.tables.labels[labelId] : true));
  const filterId = view.kind === 'filter' ? view.filterId : null;
  const filterExists = useData((s) => (filterId ? !!s.tables.filters[filterId] : true));
  const sidebarHidden = useData((s) => s.settings.sidebarHidden);

  // The open list can vanish (undoing its creation, emptying the Trash).
  useEffect(() => {
    if (!listExists) navigate(homeView());
  }, [listExists]);
  // So can the open label (undoing its creation, deleting it).
  useEffect(() => {
    if (!labelExists) navigate(homeView());
  }, [labelExists]);
  // And the open filter.
  useEffect(() => {
    if (!filterExists) navigate(homeView());
  }, [filterExists]);

  return (
    <main data-region="view" className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      {sidebarHidden && <ShowSidebarButton />}
      <FocusBar />
      {view.kind === 'list' && listExists ? (
        <ListView key={view.listId} listId={view.listId} />
      ) : view.kind === 'label' ? (
        labelExists ? (
          <LabelView key={view.labelId} labelId={view.labelId} />
        ) : null
      ) : view.kind === 'filter' ? (
        filterExists ? (
          <FilterView key={view.filterId} filterId={view.filterId} />
        ) : null
      ) : view.kind === 'matrix' ? (
        <MatrixView />
      ) : view.kind === 'tomorrow' ? (
        <TomorrowView />
      ) : view.kind === 'next7' ? (
        <Next7View />
      ) : view.kind === 'upcoming' ? (
        <UpcomingView />
      ) : view.kind === 'calendar' ? (
        <CalendarView />
      ) : view.kind === 'completed' ? (
        <CompletedView />
      ) : view.kind === 'stats' ? (
        <StatsView />
      ) : view.kind === 'reminders' ? (
        <RemindersView />
      ) : view.kind === 'archive' ? (
        <ArchiveView />
      ) : view.kind === 'trash' ? (
        <TrashView />
      ) : (
        <TodayView />
      )}
    </main>
  );
}
