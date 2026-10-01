import { Plus } from 'lucide-react';
import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { quickAddLines, quickAddTask } from '@/commands';
import { Button } from '@/components/ui';
import { parseQuickAdd, splitLines } from '@/lib/quickAdd';
import { liveTodoLists } from '@/store/sidebar';
import { useData } from '@/store/data';

/** Pasting more lines than this can only go in as one task. */
export const MAX_PASTED_TASKS = 200;

export interface QuickAddProps {
  listId: string;
  inputRef?: Ref<HTMLInputElement>;
  /** ArrowDown moves on into the list. */
  onArrowDown?: () => void;
  /** Due date for tasks whose text doesn't give one. */
  defaultDue?: string | null;
  placeholder?: string;
  /** Shown at the end of the field, e.g. which list new tasks go to. */
  hint?: ReactNode;
  /** Called after tasks were added (the quick-add dialog closes itself here). */
  onAdded?: () => void;
  /** Always say where the task went (the dialog does; the in-view field only if it went elsewhere). */
  announce?: boolean;
  /** The field of the quick-add dialog, not one in a view: Mod+N doesn't look for it. */
  inDialog?: boolean;
  /** Told whenever the paste bar opens or closes. */
  onPasteBarChange?: (open: boolean) => void;
}

/** Several lines that were pasted, and where the cursor was, waiting for a choice. */
interface Pasted {
  /** What each line becomes as a task (list markers removed). */
  tasks: string[];
  /** The lines as pasted, for pasting as one task. */
  lines: string[];
  start: number;
  end: number;
}

/**
 * The "Add a task" field at the top of a to-do list. New tasks go to the end
 * of the list. A preview shows the dates, repeats, priority, list and
 * reminder it read. Pasting several lines offers to make a task of each.
 */
export function QuickAdd({
  listId,
  inputRef,
  onArrowDown,
  defaultDue = null,
  placeholder = 'Add a task',
  hint,
  onAdded,
  announce = false,
  inDialog = false,
  onPasteBarChange,
}: QuickAddProps) {
  const [text, setText] = useState('');
  const [pasted, setPasted] = useState<Pasted | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const parseDates = useData((s) => s.settings.parseDates);
  const allLists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  const allSections = useData((s) => s.tables.sections);
  const lists = useMemo(() => liveTodoLists({ lists: allLists, folders }), [allLists, folders]);
  const sections = useMemo(() => Object.values(allSections), [allSections]);
  const chips = useMemo(
    () =>
      parseDates && text.trim()
        ? parseQuickAdd(text, new Date(), { lists, sections, listId, defaultDue }).chips
        : [],
    [parseDates, text, lists, sections, listId, defaultDue],
  );

  const barOpen = !!pasted;
  useLayoutEffect(() => {
    onPasteBarChange?.(barOpen);
    return () => onPasteBarChange?.(false);
  }, [barOpen, onPasteBarChange]);

  // Put the cursor after text that was just pasted in.
  useLayoutEffect(() => {
    if (caret.current === null) return;
    field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  useImperativeHandle(inputRef, () => field.current!, []);

  const tooMany = !!pasted && pasted.tasks.length > MAX_PASTED_TASKS;

  const addPasted = () => {
    if (!pasted || tooMany) return;
    if (quickAddLines(listId, pasted.tasks, { defaultDue, announce })) {
      setPasted(null);
      field.current?.focus();
      onAdded?.();
    }
  };

  const pasteAsOne = () => {
    if (!pasted) return;
    const joined = pasted.lines.join(' ');
    const at = pasted.start + joined.length;
    caret.current = at;
    setText(text.slice(0, pasted.start) + joined + text.slice(pasted.end));
    setPasted(null);
    field.current?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const tasks = splitLines(e.clipboardData.getData('text'));
    if (tasks.length < 2) return;
    e.preventDefault();
    const lines = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setPasted({
      tasks,
      lines,
      start: e.currentTarget.selectionStart ?? text.length,
      end: e.currentTarget.selectionEnd ?? text.length,
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (pasted) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (tooMany) pasteAsOne();
        else addPasted();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPasted(null);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (quickAddTask(listId, text, { defaultDue, announce })) {
        setText('');
        onAdded?.();
      }
    } else if (e.key === 'Escape') {
      if (text) setText('');
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' && onArrowDown) {
      e.preventDefault();
      onArrowDown();
    }
  };

  return (
    <div className="mb-2">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line-control bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
        <Plus aria-hidden className="size-4 shrink-0 text-fg-subtle" />
        <input
          ref={field}
          aria-label="Add a task"
          data-quick-add={inDialog ? undefined : true}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setPasted(null);
            setText(e.target.value);
          }}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        {hint && <span className="shrink-0 text-xs text-fg-subtle">{hint}</span>}
      </label>
      {pasted ? (
        <div
          data-paste-bar
          role="group"
          aria-label="Pasted lines"
          onKeyDown={(e) => {
            // Escape on one of the bar's buttons dismisses the bar too.
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setPasted(null);
            field.current?.focus();
          }}
          className="mt-1.5 flex flex-wrap items-center gap-2 px-1"
        >
          {tooMany ? (
            <span className="text-xs text-fg-muted">
              {pasted.tasks.length} lines is too many to add as separate tasks (the limit is{' '}
              {MAX_PASTED_TASKS}).
            </span>
          ) : (
            <Button size="sm" variant="primary" onClick={addPasted}>
              Add {pasted.tasks.length} tasks
            </Button>
          )}
          <Button size="sm" onClick={pasteAsOne}>
            Paste as one task
          </Button>
        </div>
      ) : (
        chips.length > 0 && (
          <div aria-live="polite" className="mt-1.5 flex flex-wrap gap-1.5 px-1">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
              >
                {chip}
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}
