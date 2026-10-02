import clsx from 'clsx';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toggleItem, trashItems } from '@/commands';
import { SHORTCUTS } from '@/lib/keymap';
import { matchesShortcut } from '@/lib/shortcuts';
import { useItemsWithReminders } from '@/hooks/useReminders';
import { isMac } from '@/platform';
import type { DueRow } from '@/store/smart';
import {
  clearReveal,
  closeDetails,
  dropMissingSelection,
  focusItem,
  openDetails,
  openList,
  pickDueDate,
  selectItem,
  selectRange,
  toggleSelected,
  useUI,
} from '@/store/ui';
import { useFocus } from '@/store/focus';
import { itemMenuEntries } from './itemMenu';
import { ItemRow, type RowClickKind, type RowKeyMode } from './ItemRow';
import { handleSelectionKey } from './selection';

export interface SmartSection {
  key: string;
  title: ReactNode;
  /** The section's accessible name when `title` isn't plain text. */
  label?: string;
  /** Buttons at the end of the heading. */
  actions?: ReactNode;
  tone?: 'danger';
  rows: DueRow[];
  /** Shown under the heading when there are no rows (otherwise an empty section is just a heading). */
  emptyText?: string;
  /** No heading: the view's own header already says what the rows are. */
  bare?: boolean;
  /** The heading names the day, so rows show only their time. */
  timeOnly?: boolean;
}

interface FocusRequest {
  target: string;
  mode: RowKeyMode;
}

export interface SmartListProps {
  sections: SmartSection[];
  /** ArrowUp from the first row. */
  onExitTop?: () => void;
  /** Lay the sections out as boxes in two columns (the Eisenhower matrix). */
  grid?: boolean;
  /** The list this view is of: its own top-level tasks don't say which list they're in. */
  homeListId?: string;
}

/**
 * Tasks from many lists, in sections (Today, Upcoming). Rows can be edited,
 * checked and deleted, but not nested or reordered, since the order here is
 * by date rather than the list's own.
 */
export function SmartList({ sections, onExitTop, grid = false, homeListId }: SmartListProps) {
  const selectedId = useUI((s) => s.selectedItemId);
  const multiIds = useUI((s) => s.multiSelectedIds);
  const reminded = useItemsWithReminders();
  const focusedId = useFocus((s) => s.timer?.itemId ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const visible = sections.flatMap((s) => s.rows);
  const selectionShown = visible.some((r) => r.item.id === selectedId);
  const visibleKey = visible.map((r) => r.item.id).join('|');

  // Selected tasks that leave the view (done, rescheduled, deleted) drop out of the selection.
  useLayoutEffect(() => {
    dropMissingSelection(visibleKey ? visibleKey.split('|') : []);
  }, [visibleKey]);
  // When the last row goes the whole list is replaced by an empty message, so nothing stays selected.
  useLayoutEffect(() => () => dropMissingSelection([]), []);

  useLayoutEffect(() => {
    if (!focus) return;
    const row = containerRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${focus.target}"]`,
    );
    if (!row) return;
    if (focus.mode === 'row') return row.focus();
    const input = row.querySelector('input');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [focus]);

  // A row asked for from outside (a duplicate): focus it, and never leave the request pending.
  const reveal = useUI((s) => s.reveal);
  useLayoutEffect(() => {
    if (!reveal) return;
    containerRef.current?.querySelector<HTMLElement>(`[data-item-id="${reveal}"]`)?.focus();
    clearReveal();
  }, [reveal]);

  const focusRow = (id: string, mode: RowKeyMode = 'row') => {
    selectItem(id);
    setFocus({ target: id, mode });
  };

  /** The row to move to when `index` leaves the view. */
  const neighbour = (index: number) => visible[index + 1] ?? visible[index - 1];

  const toggle = (index: number) => {
    const { item } = visible[index];
    const next = neighbour(index);
    toggleItem(item.id, !item.checked, { announce: true });
    if (next) focusRow(next.item.id);
  };

  const clickRow = (id: string, kind: RowClickKind) => {
    const ids = visible.map((r) => r.item.id);
    if (kind === 'toggle') toggleSelected(id, ids);
    else if (kind === 'range') selectRange(id, ids);
    else selectItem(id);
    // Focus follows the selection: the clicked row, or one that is still selected.
    const target = useUI.getState().selectedItemId;
    if (kind !== 'plain' && target) setFocus({ target, mode: 'row' });
  };

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: RowKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const row = visible[index];
    const id = row.item.id;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    const handled = handleSelectionKey(e, mode, {
      id,
      ids: visible.map((r) => r.item.id),
      readOnly: false,
      focusRow: (target) => setFocus({ target, mode: 'row' }),
      toggleOne: () => toggle(index),
    });
    if (handled) return;

    if (is(SHORTCUTS.dueDate)) {
      e.preventDefault();
      pickDueDate(id);
    } else if (is(SHORTCUTS.details)) {
      e.preventDefault();
      const { detailsOpen, selectedItemId } = useUI.getState();
      if (detailsOpen && selectedItemId === id) closeDetails();
      else openDetails(id);
    } else if (is('ArrowUp') || is('ArrowDown')) {
      e.preventDefault();
      const next = visible[index + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next) focusRow(next.item.id, mode);
      else if (e.key === 'ArrowUp') onExitTop?.();
    } else if (is('Escape')) {
      e.preventDefault();
      if (mode === 'text') focusRow(id, 'row');
      else if (useUI.getState().detailsOpen) closeDetails();
      else {
        selectItem(null);
        containerRef.current?.focus();
      }
    } else if (is('Enter')) {
      e.preventDefault();
      focusRow(id, mode === 'row' ? 'text' : 'row');
    } else if (is('Mod+Enter') || (mode === 'row' && is(' '))) {
      e.preventDefault();
      toggle(index);
    } else if (mode === 'row' && (is('Backspace') || is('Delete'))) {
      e.preventDefault();
      const next = neighbour(index);
      trashItems([id]);
      if (next) focusRow(next.item.id);
    }
  };

  // Where each section's rows start in `visible`.
  const starts = sections.map((_, i) =>
    sections.slice(0, i).reduce((sum, s) => sum + s.rows.length, 0),
  );
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={clsx('outline-none', grid && 'grid gap-4 md:grid-cols-2')}
    >
      {sections.map((section, sectionIndex) => (
        <section
          key={section.key}
          aria-label={
            section.label ?? (typeof section.title === 'string' ? section.title : section.key)
          }
          className={grid ? 'min-w-0 rounded-lg border border-line px-2 pb-2' : 'mb-5'}
        >
          {!section.bare && (
            <h2
              className={clsx(
                'flex h-8 items-center gap-2 border-b border-line px-2 text-[13px] font-semibold',
                section.tone === 'danger' ? 'text-danger' : 'text-fg',
                grid && 'h-9',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{section.title}</span>
              {section.actions}
            </h2>
          )}
          {!section.rows.length && section.emptyText && (
            <p className="px-2 py-2 text-sm text-fg-muted">{section.emptyText}</p>
          )}
          <div role="list" className="pt-1">
            {section.rows.map((row, rowIndex) => {
              const i = starts[sectionIndex] + rowIndex;
              const id = row.item.id;
              return (
                <ItemRow
                  key={id}
                  row={row}
                  origin={
                    row.list.id === homeListId && !row.parent
                      ? undefined
                      : { list: row.list, parentText: row.parent?.text }
                  }
                  timeOnly={section.timeOnly}
                  readOnly={false}
                  selected={id === selectedId}
                  multiSelected={multiIds.includes(id)}
                  hasReminder={reminded.has(id)}
                  focusing={focusedId === id}
                  tabbable={id === selectedId || (i === 0 && !selectionShown)}
                  onToggle={() => toggle(i)}
                  menu={() =>
                    itemMenuEntries(row.item, {
                      openDetails: () => openDetails(id),
                      goToList: () => {
                        openList(row.list.id);
                        selectItem(id);
                      },
                      remove: () => trashItems([id]),
                    })
                  }
                  onSelect={(editing) => focusItem(id, editing)}
                  onClickRow={(kind) => clickRow(id, kind)}
                  onOpenDetails={() => openDetails(id)}
                  onKeyDown={(e, mode) => onRowKey(e, i, mode)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
