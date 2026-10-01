import { Check, Flag, FolderInput, CalendarDays, Trash, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { setTasksDue, setTasksPriority, toggleItems, trashItems } from '@/commands';
import { Button, IconButton, Menu, Popover } from '@/components/ui';
import { colorVar } from '@/lib/theme';
import { useData } from '@/store/data';
import { clearMultiSelection, openDialog, setSelectionDateOpen, useUI } from '@/store/ui';
import { PRIORITIES, PRIORITY_COLOR } from './priority';
import { keepFocus } from './selection';

// The calendar is only needed once the Date popover opens, so it loads separately.
const DateChoices = lazy(() => import('./DateChoices').then((m) => ({ default: m.DateChoices })));

const icon = 'size-3.5';

/**
 * Floats at the bottom of a view while two or more tasks are selected, with
 * the actions that apply to all of them. Place it inside a `relative` box
 * around the scrolling list so it never moves the rows.
 */
export function SelectionBar() {
  const ids = useUI((s) => s.multiSelectedIds);
  const dateOpen = useUI((s) => s.selectionDateOpen);
  const items = useData((s) => s.tables.items);
  // Set when a date was picked, so closing the popover doesn't pull focus back to its button.
  const picked = useRef(false);
  // The count goes into a region that is always on the page, so the first one is announced.
  const live = (
    <div role="status" aria-live="polite" className="sr-only">
      {ids.length >= 2 ? `${ids.length} selected` : ''}
    </div>
  );
  if (ids.length < 2) return live;

  const allDone = ids.every((id) => items[id]?.checked);

  return (
    <>
      {live}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div
          role="toolbar"
          aria-label="Selected tasks"
          className="pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-elevated p-1.5 shadow-popover"
        >
          <span aria-hidden className="px-2 text-[13px] font-medium text-fg tabular-nums">
            {ids.length} selected
          </span>
          <Button size="sm" variant="ghost" onClick={() => keepFocus(() => toggleItems(ids))}>
            {allDone ? (
              <Undo2 aria-hidden className={icon} />
            ) : (
              <Check aria-hidden className={icon} />
            )}
            {allDone ? 'Mark not done' : 'Complete'}
          </Button>
          <Popover
            open={dateOpen}
            onOpenChange={(open) => {
              if (open) picked.current = false;
              setSelectionDateOpen(open);
            }}
            onCloseAutoFocus={(e) => {
              if (picked.current) e.preventDefault();
            }}
            trigger={
              <Button size="sm" variant="ghost">
                <CalendarDays aria-hidden className={icon} />
                Date
              </Button>
            }
          >
            <Suspense fallback={<div className="h-72 w-[252px]" />}>
              <DateChoices
                allowNone
                onPick={(date) => {
                  picked.current = true;
                  setSelectionDateOpen(false);
                  keepFocus(() => setTasksDue(ids, date));
                }}
              />
            </Suspense>
          </Popover>
          <Menu
            trigger={
              <Button size="sm" variant="ghost">
                <Flag aria-hidden className={icon} />
                Priority
              </Button>
            }
            entries={PRIORITIES.map((p) => ({
              label: p ? `P${p}` : 'None',
              icon: p ? (
                <Flag aria-hidden className={icon} style={{ color: colorVar(PRIORITY_COLOR[p]) }} />
              ) : undefined,
              onSelect: () => setTasksPriority(ids, p),
            }))}
          />
          <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'moveTasks', ids })}>
            <FolderInput aria-hidden className={icon} />
            Move to
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-danger-soft"
            onClick={() => keepFocus(() => trashItems(ids))}
          >
            <Trash aria-hidden className={icon} />
            Delete
          </Button>
          <IconButton
            label="Clear selection"
            icon={<X className="size-4" />}
            onClick={clearMultiSelection}
          />
        </div>
      </div>
    </>
  );
}
