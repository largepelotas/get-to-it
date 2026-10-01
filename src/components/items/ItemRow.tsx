import clsx from 'clsx';
import {
  Bell,
  ChevronRight,
  Flag,
  GripVertical,
  NotebookText,
  PanelRight,
  Repeat,
} from 'lucide-react';
import { useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react';
import { ContextMenu, IconButton, type MenuEntries } from '@/components/ui';
import { toggleItem } from '@/commands';
import { formatDue, formatTime, isOverdue } from '@/lib/dates';
import { colorVar } from '@/lib/theme';
import { setItemCollapsed, setItemText } from '@/store/actions/items';
import { isMac } from '@/platform';
import { pickDueDate } from '@/store/ui';
import type { FlatRow } from '@/store/tree';
import { Checkbox } from './Checkbox';
import { describeRow, originTitle, type RowOrigin } from './describeRow';
import { PRIORITY_COLOR } from './priority';

/** Horizontal step per subtask level, in px. Also the drag distance per level. */
export const INDENT = 24;

export type RowKeyMode = 'row' | 'text';

/** How a click on a row picks it: on its own, added or removed (Ctrl/Cmd), or as a range (Shift). */
export type RowClickKind = 'plain' | 'toggle' | 'range';

export interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  dragging: boolean;
  handle: Record<string, unknown>;
}

export interface ItemRowProps {
  row: FlatRow;
  selected: boolean;
  /** Takes part in keyboard focus (the selected row, or the first row). */
  tabbable: boolean;
  readOnly: boolean;
  /** Depth to show while dragging, when it differs from the row's own. */
  depth?: number;
  drag?: DragBits;
  /**
   * For rows outside their list (Today, Upcoming): no tree controls, and the
   * list (and parent task) shown on the right.
   */
  origin?: RowOrigin;
  /** Show only the time of the due date (the view's heading already says the day). */
  timeOnly?: boolean;
  /** Replaces the default check action (e.g. to confirm completions with a toast). */
  onToggle?: (checked: boolean) => void;
  /** The task has a reminder still to go off. */
  hasReminder?: boolean;
  /** One of several selected tasks. */
  multiSelected?: boolean;
  menu: () => MenuEntries;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, mode: RowKeyMode) => void;
  /** The row took focus; `editing` when it was the text field. */
  onSelect: (editing: boolean) => void;
  /** The row was clicked. Modifier clicks on its own controls arrive as `plain`. */
  onClickRow: (kind: RowClickKind) => void;
  onOpenDetails: () => void;
}

/**
 * The task text, edited in place. Changes save as you type. The field is as
 * wide as its text (a hidden copy sizes it), so clicking the empty part of
 * the row selects the row instead of starting to type.
 */
function ItemText({
  id,
  text,
  checked,
  readOnly,
}: {
  id: string;
  text: string;
  checked: boolean;
  readOnly: boolean;
}) {
  // Holds what's typed while it's blank or has extra spaces the store trims away.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? text;
  return (
    <span className="grid min-w-0 text-sm">
      <span aria-hidden className="invisible col-start-1 row-start-1 truncate pr-1 whitespace-pre">
        {value || ' '}
      </span>
      <input
        aria-label="Task"
        value={value}
        // The hidden copy sets the width; without this the browser's default input width wins.
        size={1}
        readOnly={readOnly}
        spellCheck
        onChange={(e) => {
          setDraft(e.target.value);
          setItemText(id, e.target.value);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(
          'col-start-1 row-start-1 w-full min-w-8 truncate bg-transparent py-0.5 outline-none',
          checked ? 'text-fg-subtle line-through' : 'text-fg',
        )}
      />
    </span>
  );
}

/** The due date on a row. Clicking it opens the due-date picker. */
function DueLabel({
  label,
  fullLabel,
  repeats,
  overdue,
  onPick,
}: {
  label: string;
  fullLabel: string;
  repeats: boolean;
  overdue: boolean;
  onPick?: () => void;
}) {
  const content = (
    <>
      {repeats && <Repeat aria-hidden className="size-3" />}
      {label}
    </>
  );
  const tone = overdue ? 'text-danger' : 'hover:text-fg';
  if (!onPick) {
    return <span className={clsx('flex items-center gap-1', tone)}>{content}</span>;
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Due date: ${fullLabel}, change`}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={clsx('-mx-1 flex items-center gap-1 rounded px-1 py-0.5 hover:bg-line', tone)}
    >
      {content}
    </button>
  );
}

/** What a mouse event on a row means: a plain pick, or a modifier pick (not on the row's own buttons). */
function clickKind(
  e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  readOnly: boolean,
  target: HTMLElement,
): RowClickKind {
  if (readOnly || target.closest('button')) return 'plain';
  if (e.shiftKey) return 'range';
  return (isMac ? e.metaKey : e.ctrlKey) ? 'toggle' : 'plain';
}

export function ItemRow({
  row,
  selected,
  tabbable,
  readOnly,
  depth = row.depth,
  drag,
  origin,
  timeOnly = false,
  onToggle,
  hasReminder = false,
  multiSelected = false,
  menu,
  onKeyDown,
  onSelect,
  onClickRow,
  onOpenDetails,
}: ItemRowProps) {
  const { item, childCount, doneCount } = row;
  const overdue = !item.checked && isOverdue(item.dueDate, item.dueTime);
  const hasNotes = !!item.details;
  // A row in a group of selected tasks says so (aria-selected isn't allowed on a list item).
  const description =
    [multiSelected && 'Selected', describeRow(row, { hasReminder, origin })]
      .filter(Boolean)
      .join('. ') || '';
  const descriptionId = `row-desc-${item.id}`;

  return (
    <ContextMenu entries={menu}>
      <div
        ref={drag?.ref}
        style={{ ...drag?.style, paddingLeft: depth * INDENT }}
        role="listitem"
        data-item-id={item.id}
        tabIndex={tabbable ? 0 : -1}
        aria-label={item.text}
        aria-describedby={description ? descriptionId : undefined}
        aria-current={selected ? 'true' : undefined}
        data-multi-selected={multiSelected ? '' : undefined}
        onFocus={(e) => onSelect((e.target as HTMLElement).tagName === 'INPUT')}
        // A modifier-click on the row picks it, so keep the browser from moving focus or text selection.
        onMouseDown={(e) => {
          if (clickKind(e, readOnly, e.target as HTMLElement) !== 'plain') e.preventDefault();
        }}
        onClick={(e) => {
          const kind = clickKind(e, readOnly, e.target as HTMLElement);
          onClickRow(kind);
          // Clicks outside the text (including the checkbox) leave the row focused for keys.
          // After a modifier click the list focuses the right row itself.
          if (kind === 'plain' && !(e.target as HTMLElement).closest('input'))
            e.currentTarget.focus();
        }}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('input, button')) onOpenDetails();
        }}
        onKeyDown={(e) =>
          onKeyDown(e, (e.target as HTMLElement).tagName === 'INPUT' ? 'text' : 'row')
        }
        className={clsx(
          'group relative flex h-8 items-center gap-1.5 rounded-md pr-1 outline-none',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
          selected || multiSelected ? 'bg-selected' : 'hover:bg-hover',
          // Keeps a row reached with Shift+arrows clear of the selection bar.
          multiSelected && 'scroll-mb-24',
          drag?.dragging && 'z-10 bg-elevated shadow-popover',
        )}
      >
        {origin ? (
          <span className="w-1 shrink-0" />
        ) : (
          <>
            {drag && !readOnly ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Drag to move"
                {...drag.handle}
                className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-fg-subtle opacity-0 group-hover:opacity-100 active:cursor-grabbing"
              >
                <GripVertical aria-hidden className="size-3.5" />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {childCount > 0 ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={item.collapsed ? 'Show subtasks' : 'Hide subtasks'}
                aria-expanded={!item.collapsed}
                onClick={() => setItemCollapsed(item.id, !item.collapsed)}
                className="-ml-1 flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg"
              >
                <ChevronRight
                  aria-hidden
                  className={clsx('size-3.5 transition-transform', !item.collapsed && 'rotate-90')}
                />
              </button>
            ) : (
              <span className="-ml-1 w-4 shrink-0" />
            )}
          </>
        )}
        <Checkbox
          checked={item.checked}
          wontDo={item.wontDo}
          priority={item.priority}
          disabled={readOnly}
          label={item.text}
          onChange={(checked) => (onToggle ? onToggle(checked) : toggleItem(item.id, checked))}
        />
        <ItemText id={item.id} text={item.text} checked={item.checked} readOnly={readOnly} />
        <span className="min-w-0 flex-1 self-stretch" />
        {description && (
          <span id={descriptionId} hidden>
            {description}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-2 pl-1 text-xs text-fg-subtle">
          {childCount > 0 && (
            <span aria-hidden className="tabular-nums">
              {doneCount}/{childCount}
            </span>
          )}
          {hasReminder && <Bell aria-hidden className="size-3.5" />}
          {hasNotes && <NotebookText aria-hidden className="size-3.5" />}
          {item.dueDate && (!timeOnly || item.dueTime || item.recurrence) && (
            <DueLabel
              label={
                timeOnly
                  ? (item.dueTime && formatTime(item.dueTime)) || ''
                  : formatDue(item.dueDate, item.dueTime)
              }
              fullLabel={formatDue(item.dueDate, item.dueTime)}
              repeats={!!item.recurrence}
              overdue={overdue}
              onPick={readOnly ? undefined : () => pickDueDate(item.id)}
            />
          )}
          {item.priority > 0 && (
            <Flag
              aria-hidden
              className="size-3.5"
              style={{ color: colorVar(PRIORITY_COLOR[item.priority]) }}
            />
          )}
          {origin && (
            <span
              aria-hidden
              className="flex max-w-48 min-w-0 items-center gap-1.5"
              title={originTitle(origin)}
            >
              <span className="truncate">{originTitle(origin)}</span>
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: colorVar(origin.list.color) ?? 'var(--line-strong)' }}
              />
            </span>
          )}
        </span>
        <IconButton
          size="sm"
          label="Open details"
          tabIndex={-1}
          tooltip={false}
          icon={<PanelRight className="size-3.5" />}
          onClick={onOpenDetails}
          className={clsx(!selected && 'opacity-0 group-hover:opacity-100')}
        />
      </div>
    </ContextMenu>
  );
}

/** The inline field for a new task, opened with Enter from a row. */
export interface DraftRowProps {
  depth: number;
  inputRef: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

export function DraftRow({ depth, inputRef, value, onChange, onKeyDown, onBlur }: DraftRowProps) {
  return (
    <div
      role="listitem"
      data-draft
      style={{ paddingLeft: depth * INDENT }}
      className="flex h-8 items-center gap-1.5 rounded-md bg-hover pr-1"
    >
      <span className="w-4 shrink-0" />
      <span className="-ml-1 w-4 shrink-0" />
      <span className="size-4 shrink-0 rounded-full border-[1.5px] border-dashed border-line-control" />
      <input
        ref={inputRef}
        aria-label="New task"
        placeholder="New task"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
