import { useEffect } from 'react';
import { homeView } from '@/commands';
import { useData } from '@/store/data';
import { navigate, useUI } from '@/store/ui';
import { ListView } from './views/ListView';
import { TodayView, UpcomingView } from './views/SmartViews';
import { ArchiveView, TrashView } from './views/StoredLists';

export function MainPane() {
  const view = useUI((s) => s.view);
  const listId = view.kind === 'list' ? view.listId : null;
  const listExists = useData((s) => (listId ? !!s.tables.lists[listId] : true));

  // The open list can vanish (undoing its creation, emptying the Trash).
  useEffect(() => {
    if (!listExists) navigate(homeView());
  }, [listExists]);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      {view.kind === 'list' && listExists ? (
        <ListView key={view.listId} listId={view.listId} />
      ) : view.kind === 'upcoming' ? (
        <UpcomingView />
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
