import clsx from 'clsx';
import { CalendarDays, ChevronUp, Flag, Plus, Repeat, Trash, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { toggleItem, trashItems } from '@/commands';
import { Button, IconButton, Popover } from '@/components/ui';
import type { Item } from '@/data/types';
import { formatDue, formatShortDate, formatTimestamp, isOverdue } from '@/lib/dates';
import { describeRecurrence } from '@/lib/recurrence';
import { colorVar } from '@/lib/theme';
import {
  clearDue,
  createItemFromText,
  itemNotesText,
  setItemNotes,
  setItemText,
  setPriority,
} from '@/store/actions/items';
import { useData } from '@/store/data';
import { childrenIndex, depthOf, MAX_DEPTH } from '@/store/tree';
import { closeDetails, openDetails, setDuePickerFor, useUI } from '@/store/ui';
import { Checkbox } from './Checkbox';
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from './priority';

// The calendar is only needed once the picker opens, so it loads separately.
const DuePicker = lazy(() => import('./DuePicker').then((m) => ({ default: m.DuePicker })));

const fieldClass =
  'w-full resize-none rounded-md bg-transparent outline-none placeholder:text-fg-subtle focus:bg-hover';

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-1.5 text-xs font-medium text-fg-muted">{children}</h3>;
}

/** A text field that saves as you type and shows the stored value when not focused. */
function useDraft(stored: string) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? stored,
    set: setDraft,
    reset: () => setDraft(null),
  };
}

function TitleField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const title = useDraft(item.text);
  return (
    <textarea
      aria-label="Task title"
      rows={1}
      value={title.value}
      readOnly={readOnly}
      onChange={(e) => {
        const text = e.target.value.replace(/\n/g, ' ');
        title.set(text);
        setItemText(item.id, text);
      }}
      onBlur={title.reset}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={clsx(
        fieldClass,
        'field-sizing-content px-1 py-0.5 text-base font-semibold',
        item.checked && 'text-fg-subtle line-through',
      )}
    />
  );
}

function NotesField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const stored = useMemo(() => itemNotesText(item), [item]);
  const notes = useDraft(stored);
  return (
    <textarea
      aria-label="Notes"
      placeholder="Add notes"
      value={notes.value}
      readOnly={readOnly}
      onChange={(e) => {
        notes.set(e.target.value);
        setItemNotes(item.id, e.target.value);
      }}
      onBlur={notes.reset}
      className={clsx(fieldClass, 'field-sizing-content min-h-24 px-2 py-1.5 text-sm')}
    />
  );
}

function AddSubtask({ parent }: { parent: Item }) {
  const [text, setText] = useState('');
  return (
    <label className="flex h-7 items-center gap-2 rounded-md px-1 text-sm text-fg-subtle focus-within:bg-hover">
      <Plus aria-hidden className="size-4 shrink-0" />
      <input
        aria-label="Add subtask"
        placeholder="Add subtask"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            if (createItemFromText(parent.listId, text, { parentId: parent.id })) setText('');
          } else if (e.key === 'Escape' && text) {
            e.stopPropagation();
            setText('');
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
      />
    </label>
  );
}

/** The due date, time and repeat, with a picker in a popover. */
function DueField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const open = useUI((s) => s.duePickerFor === item.id);
  const overdue = !item.checked && isOverdue(item.dueDate, item.dueTime);
  const summary = (
    <>
      <CalendarDays aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-left">
        {item.dueDate ? formatDue(item.dueDate, item.dueTime) : 'Add due date'}
        {item.recurrence && (
          <span className="flex items-center gap-1 text-xs text-fg-subtle">
            <Repeat aria-hidden className="size-3" />
            {describeRecurrence(item.recurrence, item.dueDate)}
          </span>
        )}
      </span>
    </>
  );
  const boxClass = clsx(
    'flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
    overdue ? 'text-danger' : item.dueDate ? 'text-fg' : 'text-fg-subtle',
  );

  if (readOnly) {
    return item.dueDate ? <div className={clsx(boxClass, 'bg-sidebar')}>{summary}</div> : null;
  }
  return (
    <div className="flex items-center gap-1 rounded-md bg-sidebar pr-1">
      <Popover
        open={open}
        onOpenChange={(next) => setDuePickerFor(next ? item.id : null)}
        align="start"
        className="p-2"
        trigger={
          <button
            type="button"
            aria-label={
              item.dueDate ? `Due ${formatDue(item.dueDate, item.dueTime)}, change` : 'Add due date'
            }
            className={clsx(boxClass, 'hover:bg-hover')}
          >
            {summary}
          </button>
        }
      >
        <Suspense fallback={<div className="h-[440px] w-[252px]" />}>
          <DuePicker item={item} onPicked={() => setDuePickerFor(null)} />
        </Suspense>
      </Popover>
      {item.dueDate && (
        <IconButton
          size="sm"
          label="Clear due date"
          icon={<X className="size-3.5" />}
          onClick={() => clearDue(item.id)}
        />
      )}
    </div>
  );
}

const HISTORY_SHOWN = 5;

/** Past completions of a repeating task, newest first. */
function CompletionHistory({ item }: { item: Item }) {
  const all = useData((s) => s.tables.completions);
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(
    () =>
      Object.values(all)
        .filter((c) => c.itemId === item.id)
        .sort((a, b) => b.completedAt - a.completedAt),
    [all, item.id],
  );
  if (!entries.length) return null;
  const shown = expanded ? entries : entries.slice(0, HISTORY_SHOWN);
  return (
    <div>
      <h3 className="mb-1.5 flex text-xs font-medium text-fg-muted">
        <span className="flex-1">Completed</span>
        <span className="font-normal text-fg-subtle tabular-nums">
          {entries.length === 1 ? '1 time' : `${entries.length} times`}
        </span>
      </h3>
      <ul aria-label="Completion history" className="space-y-1 text-xs">
        {shown.map((c) => (
          <li key={c.id} className="flex gap-2 px-1">
            <span className="flex-1 text-fg">{formatTimestamp(c.completedAt)}</span>
            {c.dueDate && <span className="text-fg-subtle">due {formatShortDate(c.dueDate)}</span>}
          </li>
        ))}
      </ul>
      {entries.length > HISTORY_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 rounded px-1 text-xs text-accent hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}

export interface ItemDetailsProps {
  item: Item;
  readOnly: boolean;
}

/** The side panel for the selected task. */
export function ItemDetails({ item, readOnly }: ItemDetailsProps) {
  const items = useData((s) => s.tables.items);
  const { parent, subtasks, depth } = useMemo(() => {
    const live = Object.values(items).filter((i) => i.listId === item.listId && !i.deletedAt);
    const byId = new Map(live.map((i) => [i.id, i]));
    return {
      parent: item.parentId ? byId.get(item.parentId) : undefined,
      subtasks: childrenIndex(live).get(item.id) ?? [],
      depth: depthOf(byId, item),
    };
  }, [items, item]);
  const doneCount = subtasks.filter((s) => s.checked).length;

  return (
    <aside
      aria-label="Task details"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) closeDetails();
      }}
      className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-surface"
    >
      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-1 px-3 pt-2">
        {parent ? (
          <button
            type="button"
            onClick={() => openDetails(parent.id)}
            className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-fg-muted hover:bg-hover hover:text-fg"
          >
            <ChevronUp aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{parent.text}</span>
          </button>
        ) : null}
        <div data-tauri-drag-region className="flex-1 self-stretch" />
        <IconButton
          label="Close details"
          shortcut="Escape"
          icon={<X className="size-4" />}
          onClick={closeDetails}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
        <div className="flex items-start gap-2">
          <Checkbox
            className="mt-1.5"
            checked={item.checked}
            priority={item.priority}
            disabled={readOnly}
            label={item.checked ? 'Mark as not done' : 'Mark as done'}
            onChange={(checked) => toggleItem(item.id, checked)}
          />
          <TitleField key={item.id} item={item} readOnly={readOnly} />
        </div>

        <DueField item={item} readOnly={readOnly} />

        <div>
          <SectionLabel>Priority</SectionLabel>
          <div role="group" aria-label="Priority" className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={item.priority === p}
                aria-label={PRIORITY_LABEL[p]}
                disabled={readOnly}
                onClick={() => setPriority(item.id, p)}
                className={clsx(
                  'flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-xs font-medium disabled:opacity-50',
                  item.priority === p
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-line text-fg-muted hover:bg-hover',
                )}
              >
                {p ? (
                  <>
                    <Flag
                      aria-hidden
                      className="size-3"
                      style={{ color: colorVar(PRIORITY_COLOR[p]) }}
                    />
                    P{p}
                  </>
                ) : (
                  'None'
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Notes</SectionLabel>
          <NotesField key={item.id} item={item} readOnly={readOnly} />
        </div>

        {(subtasks.length > 0 || (!readOnly && depth < MAX_DEPTH)) && (
          <div>
            <h3 className="mb-1.5 flex text-xs font-medium text-fg-muted">
              <span className="flex-1">Subtasks</span>
              {subtasks.length > 0 && (
                <span className="font-normal text-fg-subtle tabular-nums">
                  {doneCount}/{subtasks.length}
                </span>
              )}
            </h3>
            <ul aria-label="Subtasks">
              {subtasks.map((sub) => (
                <li
                  key={sub.id}
                  className="flex h-7 items-center gap-2 rounded-md px-1 hover:bg-hover"
                >
                  <Checkbox
                    checked={sub.checked}
                    priority={sub.priority}
                    disabled={readOnly}
                    label={sub.text}
                    onChange={(checked) => toggleItem(sub.id, checked)}
                  />
                  <button
                    type="button"
                    onClick={() => openDetails(sub.id)}
                    className={clsx(
                      'min-w-0 flex-1 truncate text-left text-sm',
                      sub.checked ? 'text-fg-subtle line-through' : 'text-fg',
                    )}
                  >
                    {sub.text}
                  </button>
                </li>
              ))}
            </ul>
            {!readOnly && depth < MAX_DEPTH && <AddSubtask parent={item} />}
          </div>
        )}

        <CompletionHistory item={item} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-fg-subtle">
        <span className="min-w-0 flex-1 truncate">
          {item.completedAt
            ? `Completed ${formatTimestamp(item.completedAt)}`
            : `Created ${formatTimestamp(item.createdAt)}`}
        </span>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete task"
            className="text-danger"
            onClick={() => trashItems([item.id])}
          >
            <Trash aria-hidden className="size-3.5" />
            Delete
          </Button>
        )}
      </div>
    </aside>
  );
}
