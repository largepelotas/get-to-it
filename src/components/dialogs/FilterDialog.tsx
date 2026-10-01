import { useMemo, useState } from 'react';
import { saveFilter } from '@/commands';
import { Button, Dialog, Input, Label } from '@/components/ui';
import { useToday } from '@/hooks/useToday';
import { FILTER_SYNTAX } from '@/lib/filterQuery';
import { useData } from '@/store/data';
import { compileQuery, filterRows } from '@/store/filters';
import { closeDialog, useUI } from '@/store/ui';

/**
 * New filter, or editing one: a name and a query, with what the query reads
 * as (or what's wrong with it) shown as you type, and the syntax underneath.
 */
export function FilterDialog() {
  const dialog = useUI((s) => s.dialog);
  const filterId = dialog?.kind === 'filter' ? dialog.filterId : undefined;
  const existing = useData((s) => (filterId ? s.tables.filters[filterId] : undefined));
  const items = useData((s) => s.tables.items);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const [name, setName] = useState(existing?.name ?? '');
  const [query, setQuery] = useState(existing?.query ?? '');
  const [tried, setTried] = useState(false);

  const compiled = useMemo(
    () => (query.trim() ? compileQuery(query, { lists, labels }, today) : null),
    [query, lists, labels, today],
  );
  const matches = useMemo(
    () => (compiled?.ok ? filterRows(items, lists, compiled.match).length : 0),
    [compiled, items, lists],
  );
  if (dialog?.kind !== 'filter') return null;

  const editing = !!existing;
  const valid = !!name.trim() && !!compiled?.ok;
  const submit = () => {
    setTried(true);
    if (!valid) return;
    saveFilter(filterId, name, query);
  };
  const status = !query.trim()
    ? tried
      ? 'Type a search.'
      : null
    : compiled?.ok
      ? matches === 1
        ? 'Matches 1 task.'
        : `Matches ${matches} tasks.`
      : (compiled?.error ?? null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title={editing ? 'Edit filter' : 'New filter'}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="primary" type="submit" form="filter-form">
            {editing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id="filter-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="filter-name">Name</Label>
          <Input
            id="filter-name"
            autoFocus={!editing}
            value={name}
            placeholder="e.g. This week at work"
            aria-invalid={tried && !name.trim() ? true : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {tried && !name.trim() && (
            <p role="alert" className="mt-1 text-xs text-danger">
              Give the filter a name.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="filter-query">Search</Label>
          <Input
            id="filter-query"
            autoFocus={editing}
            value={query}
            placeholder="e.g. #Work & 7 days"
            spellCheck={false}
            aria-invalid={compiled && !compiled.ok ? true : undefined}
            aria-describedby="filter-status"
            onChange={(e) => setQuery(e.target.value)}
          />
          <p
            id="filter-status"
            role={compiled && !compiled.ok ? 'alert' : 'status'}
            className={
              compiled && !compiled.ok ? 'mt-1 text-xs text-danger' : 'mt-1 text-xs text-fg-muted'
            }
          >
            {status ?? 'Join terms with &, | and !, and group them with brackets.'}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-fg-muted">
          {FILTER_SYNTAX.map((row) => (
            <div key={row.example} className="contents">
              <dt>
                <code className="text-fg">{row.example}</code>
              </dt>
              <dd>{row.meaning}</dd>
            </div>
          ))}
        </dl>
      </form>
    </Dialog>
  );
}
