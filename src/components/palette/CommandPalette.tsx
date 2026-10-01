import clsx from 'clsx';
import { Command } from 'cmdk';
import { Circle, CircleCheck, Search, ShoppingCart } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { revealItem } from '@/commands';
import { ListIcon } from '@/components/ListIcon';
import { Kbd } from '@/components/ui';
import type { List } from '@/data/types';
import { formatDue } from '@/lib/dates';
import { useData } from '@/store/data';
import { queryTerms, search, type SearchResult, type Snippet } from '@/store/search';
import { sidebarModel } from '@/store/sidebar';
import { closeDialog, openList, useUI } from '@/store/ui';
import { commandScore, paletteCommands, type PaletteCommand } from './paletteCommands';

/** Text with the matched parts highlighted. */
function Highlighted({ snippet }: { snippet: Snippet }) {
  const parts: ReactNode[] = [];
  let at = 0;
  snippet.ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(snippet.text.slice(at, start));
    parts.push(
      <mark key={i} className="rounded-sm bg-accent-soft text-inherit">
        {snippet.text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  parts.push(snippet.text.slice(at));
  return <>{parts}</>;
}

const itemClass =
  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg data-[selected=true]:bg-selected';

function Row({
  value,
  icon,
  onSelect,
  children,
  aside,
}: {
  value: string;
  icon: ReactNode;
  onSelect: () => void;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Command.Item value={value} onSelect={onSelect} className={itemClass}>
      <span className="flex size-4 shrink-0 items-center justify-center text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {aside && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-subtle">{aside}</span>
      )}
    </Command.Item>
  );
}

function ListRow({ list, title, onSelect }: { list: List; title?: Snippet; onSelect: () => void }) {
  return (
    <Row
      value={`list:${list.id}`}
      icon={<ListIcon type={list.type} color={list.color} />}
      onSelect={onSelect}
      aside={list.archivedAt ? 'Archived' : undefined}
    >
      <span className="block truncate">{title ? <Highlighted snippet={title} /> : list.title}</span>
    </Row>
  );
}

function ResultRow({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
  if (result.kind === 'list') {
    return <ListRow list={result.list} title={result.title} onSelect={onSelect} />;
  }
  const { list, snippet } = result;
  const item = result.kind === 'item' ? result.item : null;
  const icon = !item ? (
    <ListIcon type="note" color={list.color} />
  ) : item.checked ? (
    <CircleCheck className="size-4" />
  ) : list.type === 'grocery' ? (
    <ShoppingCart className="size-4" />
  ) : (
    <Circle className="size-4" />
  );
  return (
    <Row
      value={`${result.kind}:${result.id}`}
      icon={icon}
      onSelect={onSelect}
      aside={
        item && (
          <>
            {item.dueDate && <span>{formatDue(item.dueDate, item.dueTime)}</span>}
            <span className="flex max-w-40 items-center gap-1">
              <ListIcon type={list.type} color={list.color} className="size-3.5" />
              <span className="truncate">{list.title}</span>
            </span>
          </>
        )
      }
    >
      <span className={clsx('block truncate', item?.checked && 'text-fg-muted line-through')}>
        <Highlighted snippet={result.title} />
      </span>
      {snippet && (
        <span className="block truncate text-xs text-fg-muted">
          <Highlighted snippet={snippet} />
        </span>
      )}
    </Row>
  );
}

const groupClass =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-subtle';

/**
 * ⌘K: searches every list, task, grocery item and note, and runs commands.
 * With no query it offers the lists and all commands.
 */
export function CommandPalette() {
  const [query, setQuery] = useState('');
  // The highlighted row. If it isn't shown any more, the first row is.
  const [selected, setSelected] = useState('');
  const tables = useData((s) => s.tables);
  const theme = useData((s) => s.settings.theme);
  const palette = useData((s) => s.settings.palette);
  const sidebarHidden = useData((s) => s.settings.sidebarHidden);
  const undoLabel = useData((s) => s.past[s.past.length - 1]?.label ?? null);
  const redoLabel = useData((s) => s.future[s.future.length - 1]?.label ?? null);
  const view = useUI((s) => s.view);
  // Whether the chosen action moves focus itself; otherwise focus goes back where it was.
  const movesFocus = useRef(false);

  const terms = useMemo(() => queryTerms(query), [query]);
  // Synchronous on purpose: Enter has to act on the rows for what's typed, not
  // on results still catching up. Search caches folded text, so it stays fast.
  const results = useMemo(() => search(tables, query), [tables, query]);
  /** Commands with how well they match, best first (all of them, in order, with no query). */
  const commands = useMemo(() => {
    const all = paletteCommands({
      view,
      tables,
      theme,
      palette,
      sidebarHidden,
      undoLabel,
      redoLabel,
    });
    if (!terms.length) return all.map((command) => ({ command, score: 0 }));
    return all
      .map((command) => ({ command, score: commandScore(command, terms) }))
      .filter((c): c is { command: PaletteCommand; score: number } => c.score !== null)
      .sort((a, b) => b.score - a.score);
  }, [view, tables, theme, palette, sidebarHidden, undoLabel, redoLabel, terms]);
  const allLists = useMemo(() => {
    if (terms.length) return [];
    const model = sidebarModel(tables);
    return [...model.unfiled, ...model.folders.flatMap((f) => f.lists)];
  }, [tables, terms]);

  /** Closes the palette, then runs the action (so a dialog or focus change isn't undone by it). */
  const choose = (action: () => void, keepsFocus = false) => {
    movesFocus.current = !keepsFocus;
    closeDialog();
    setTimeout(action, 0);
  };
  const runCommand = (c: PaletteCommand) => choose(c.run, c.keepsFocus);
  const open = (result: SearchResult) =>
    choose(() => (result.kind === 'item' ? revealItem(result.id) : openList(result.id)));

  const commandRows = commands.map(({ command: c }) => (
    <Row
      key={c.id}
      value={`cmd:${c.id}`}
      icon={<c.icon className="size-4" />}
      onSelect={() => runCommand(c)}
      aside={c.shortcut && <Kbd shortcut={c.shortcut} plain />}
    >
      <span className="block truncate">{c.label}</span>
    </Row>
  ));

  // With a query, the group with the best match comes first. Ties keep this order.
  const groups: { heading: string; top: number; results: SearchResult[] | null }[] = terms.length
    ? [
        { heading: 'Commands', top: commands[0]?.score ?? 0, results: null },
        { heading: 'Lists', top: results.lists[0]?.score ?? 0, results: results.lists },
        {
          heading: 'Tasks and items',
          top: results.items[0]?.score ?? 0,
          results: results.items,
        },
        { heading: 'Notes', top: results.notes[0]?.score ?? 0, results: results.notes },
      ]
        .filter((g) => (g.results ?? commands).length > 0)
        .sort((a, b) => b.top - a.top)
    : [];

  // Every row's value in display order. The selection is kept here rather than
  // left to cmdk, which can lose it when groups change order as you type.
  const commandValues = commands.map((c) => `cmd:${c.command.id}`);
  const values = terms.length
    ? groups.flatMap((g) => g.results?.map((r) => `${r.kind}:${r.id}`) ?? commandValues)
    : [...allLists.map((l) => `list:${l.id}`), ...commandValues];
  const current = values.includes(selected) ? selected : (values[0] ?? '');

  return (
    <D.Root open onOpenChange={(o) => !o && closeDialog()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <D.Content
          onCloseAutoFocus={(e) => {
            if (movesFocus.current) e.preventDefault();
          }}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-elevated shadow-popover outline-none"
        >
          <D.Title className="sr-only">Search and commands</D.Title>
          <D.Description className="sr-only">
            Search lists, tasks and notes, or run a command.
          </D.Description>
          <Command
            shouldFilter={false}
            loop
            vimBindings={false}
            value={current}
            onValueChange={setSelected}
            label="Search and commands"
          >
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={(q) => {
                  setQuery(q);
                  setSelected('');
                }}
                placeholder="Search, or type a command"
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
              />
            </div>
            <Command.List className="max-h-[min(440px,60vh)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">
                Nothing found for “{query.trim()}”.
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g.heading} heading={g.heading} className={groupClass}>
                  {g.results
                    ? g.results.map((r) => (
                        <ResultRow key={r.id} result={r} onSelect={() => open(r)} />
                      ))
                    : commandRows}
                </Command.Group>
              ))}
              {allLists.length > 0 && (
                <Command.Group heading="Lists" className={groupClass}>
                  {allLists.map((list) => (
                    <ListRow
                      key={list.id}
                      list={list}
                      onSelect={() => choose(() => openList(list.id))}
                    />
                  ))}
                </Command.Group>
              )}
              {terms.length === 0 && (
                <Command.Group heading="Commands" className={groupClass}>
                  {commandRows}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
