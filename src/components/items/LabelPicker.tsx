import clsx from 'clsx';
import { Check, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ColorName } from '@/data/types';
import { colorVar } from '@/lib/theme';
import { createLabelOnItems, toggleLabelOnItems } from '@/store/actions/labels';
import { useData } from '@/store/data';
import { normalizeLabelName, sameLabelName, sortedLabels } from '@/store/labels';

/** A small dot in the label's colour (a ring when it has none). */
export function LabelDot({ color }: { color: ColorName | null }) {
  return (
    <span
      aria-hidden
      className={clsx('size-2 shrink-0 rounded-full', !color && 'border border-fg-subtle')}
      style={color ? { background: colorVar(color) } : undefined}
    />
  );
}

type Row =
  | { kind: 'label'; id: string; name: string; color: ColorName | null }
  | { kind: 'create'; name: string };

/**
 * The label picker: a filter field over every label as a checklist. A label is
 * ticked when all of `ids` have it, partly ticked when only some do. Choosing
 * one applies it to the whole group; the picker stays open for more.
 */
export function LabelPicker({ ids }: { ids: string[] }) {
  const labelTable = useData((s) => s.tables.labels);
  const items = useData((s) => s.tables.items);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const typed = normalizeLabelName(text);
    const out: Row[] = sortedLabels(labelTable)
      .filter((l) => !typed || l.name.toLowerCase().includes(typed.toLowerCase()))
      .map((l) => ({ kind: 'label', id: l.id, name: l.name, color: l.color }));
    if (typed && !sortedLabels(labelTable).some((l) => sameLabelName(l.name, typed))) {
      out.push({ kind: 'create', name: typed });
    }
    return out;
  }, [labelTable, text]);

  const state = (labelId: string): boolean | 'mixed' => {
    const have = ids.filter((id) => items[id]?.labelIds?.includes(labelId)).length;
    return have === 0 ? false : have === ids.length ? true : 'mixed';
  };

  const choose = (row: Row) => {
    if (row.kind === 'create') {
      createLabelOnItems(ids, row.name);
      setText('');
      inputRef.current?.focus();
    } else toggleLabelOnItems(ids, row.id);
  };

  const buttons = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  const move = (from: HTMLElement | null, step: 1 | -1) => {
    const all = buttons();
    const at = from ? all.indexOf(from as HTMLButtonElement) : -1;
    const next = at + step;
    if (next < 0) inputRef.current?.focus();
    else all[Math.min(next, all.length - 1)]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return;
    const inInput = e.target === inputRef.current;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(inInput ? null : (e.target as HTMLElement), e.key === 'ArrowDown' ? 1 : -1);
    } else if (inInput && e.key === 'Enter') {
      e.preventDefault();
      // A label named exactly as typed wins over an earlier one that only contains it.
      const exact = rows.find((r) => r.kind === 'label' && sameLabelName(r.name, text));
      const row = exact ?? rows[0];
      if (row) choose(row);
    }
    // Escape is left to the popover, which closes and hands focus back.
  };

  return (
    <div className="w-60" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        aria-label="Filter or create a label"
        placeholder="Find or create a label"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mb-1.5 h-8 w-full rounded-md border border-line bg-transparent px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div ref={listRef} role="group" aria-label="Labels" className="max-h-60 overflow-y-auto">
        {rows.map((row) =>
          row.kind === 'create' ? (
            <button
              key="create"
              type="button"
              tabIndex={-1}
              onClick={() => choose(row)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <Plus aria-hidden className="size-3.5 shrink-0 text-fg-muted" />
              <span className="min-w-0 truncate">{`Create "${row.name}"`}</span>
            </button>
          ) : (
            <button
              key={row.id}
              type="button"
              role="checkbox"
              aria-checked={state(row.id)}
              tabIndex={-1}
              onClick={() => choose(row)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded border border-line-control"
              >
                {state(row.id) === true && <Check className="size-3" />}
                {state(row.id) === 'mixed' && <Minus className="size-3" />}
              </span>
              <LabelDot color={row.color} />
              <span className="min-w-0 truncate">{row.name}</span>
            </button>
          ),
        )}
        {!rows.length && <p className="px-2 py-1.5 text-xs text-fg-subtle">No labels yet.</p>}
      </div>
    </div>
  );
}
