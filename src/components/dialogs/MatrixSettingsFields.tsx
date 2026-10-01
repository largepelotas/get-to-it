import { useMemo } from 'react';
import { Input } from '@/components/ui';
import { DEFAULT_MATRIX, type MatrixSettings } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { setSetting, useData } from '@/store/data';
import { compileQuery } from '@/store/filters';

/** One of the two searches the matrix is built from, with what's wrong with it as you type. */
function MatrixField({ which, label }: { which: keyof MatrixSettings; label: string }) {
  const matrix = useData((s) => s.settings.matrix);
  const lists = useData((s) => s.tables.lists);
  const labels = useData((s) => s.tables.labels);
  const today = useToday();
  const value = matrix[which];
  const error = useMemo(() => {
    const compiled = compileQuery(value, { lists, labels }, today);
    return compiled.ok ? null : compiled.error;
  }, [value, lists, labels, today]);
  const id = `settings-matrix-${which}`;
  return (
    <div className="flex items-start gap-3">
      <label htmlFor={id} className="flex-1 pt-1.5 text-sm text-fg">
        {label}
      </label>
      <div className="w-48 shrink-0">
        <Input
          id={id}
          value={value}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setSetting('matrix', { ...matrix, [which]: e.target.value })}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** The Settings section for the Eisenhower matrix: what counts as urgent and as important. */
export function MatrixSettingsFields() {
  return (
    <>
      <MatrixField which="urgent" label="Urgent when" />
      <MatrixField which="important" label="Important when" />
      <p className="text-xs text-fg-subtle">
        Searches in the language of filters (p1, overdue, 7 days, #List, @label, joined with & and
        |). The defaults are “{DEFAULT_MATRIX.urgent}” and “{DEFAULT_MATRIX.important}”.
      </p>
    </>
  );
}
