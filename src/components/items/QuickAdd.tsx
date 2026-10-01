import { Plus } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { parseQuickAdd } from '@/lib/quickAdd';
import { createItemFromText } from '@/store/actions/items';
import { useData } from '@/store/data';

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
}

/**
 * The "Add a task" field at the top of a to-do list. New tasks go to the end
 * of the list. A preview shows the dates, repeats and priority it read.
 */
export function QuickAdd({
  listId,
  inputRef,
  onArrowDown,
  defaultDue = null,
  placeholder = 'Add a task',
  hint,
}: QuickAddProps) {
  const [text, setText] = useState('');
  const parseDates = useData((s) => s.settings.parseDates);
  const chips = useMemo(
    () => (parseDates && text.trim() ? parseQuickAdd(text).chips : []),
    [parseDates, text],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (createItemFromText(listId, text, {}, defaultDue)) setText('');
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
          ref={inputRef}
          aria-label="Add a task"
          data-quick-add
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        {hint && <span className="shrink-0 text-xs text-fg-subtle">{hint}</span>}
      </label>
      {chips.length > 0 && (
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
      )}
    </div>
  );
}
