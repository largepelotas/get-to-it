import clsx from 'clsx';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toggleItem, trashItems } from '@/commands';
import { matchesShortcut } from '@/lib/shortcuts';
import { isMac } from '@/platform';
import type { DueRow } from '@/store/smart';
import { closeDetails, openDetails, openList, selectItem, useUI } from '@/store/ui';
import { itemMenuEntries } from './itemMenu';
import { ItemRow, type RowKeyMode } from './ItemRow';

export interface SmartSection {
  key: string;
  title: ReactNode;
  /** Buttons at the end of the heading. */
  actions?: ReactNode;
  tone?: 'danger';
  rows: DueRow[];
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
}

/**
 * Tasks from many lists, in sections (Today, Upcoming). Rows can be edited,
 * checked and deleted, but not nested or reordered, since the order here is
 * by date rather than the list's own.
 */
export function SmartList({ sections, onExitTop }: SmartListProps) {
  const selectedId = useUI((s) => s.selectedItemId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const visible = sections.flatMap((s) => s.rows);
  const selectionShown = visible.some((r) => r.item.id === selectedId);

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

  const onRowKey = (e: KeyboardEvent<HTMLElement>, index: number, mode: RowKeyMode) => {
    if (e.nativeEvent.isComposing) return;
    const row = visible[index];
    const id = row.item.id;
    const is = (shortcut: string) => matchesShortcut(e, shortcut, isMac);

    if (is('Mod+I')) {
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
    <div ref={containerRef} tabIndex={-1} className="outline-none">
      {sections.map((section, sectionIndex) => (
        <section
          key={section.key}
          aria-label={typeof section.title === 'string' ? section.title : section.key}
          className="mb-5"
        >
          <h2
            className={clsx(
              'flex h-8 items-center gap-2 border-b border-line px-2 text-[13px] font-semibold',
              section.tone === 'danger' ? 'text-danger' : 'text-fg',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{section.title}</span>
            {section.actions}
          </h2>
          <div role="list" className="pt-1">
            {section.rows.map((row, rowIndex) => {
              const i = starts[sectionIndex] + rowIndex;
              const id = row.item.id;
              return (
                <ItemRow
                  key={id}
                  row={row}
                  origin={{ list: row.list, parentText: row.parent?.text }}
                  timeOnly={section.timeOnly}
                  readOnly={false}
                  selected={id === selectedId}
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
                  onSelect={() => selectItem(id)}
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
