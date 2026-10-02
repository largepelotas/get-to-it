import clsx from 'clsx';
import { ArrowDownUp, Check } from 'lucide-react';
import { useState } from 'react';
import { IconButton, Popover } from '@/components/ui';
import type { GroupKey, SortKey, ViewLayout } from '@/data/types';
import type { View } from '@/store/ui';
import { useViewOptions, type Choice } from './arrangement';

const LAYOUTS: Choice<ViewLayout>[] = [
  { key: 'list', label: 'List' },
  { key: 'board', label: 'Board' },
];

/** One set of choices: a radio group drawn as a list. */
function Choices<K extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="min-w-36">
      <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-subtle">{label}</p>
      {choices.map((c) => {
        const checked = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(c.key)}
            className={clsx(
              'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none',
              'hover:bg-hover focus-visible:bg-hover',
            )}
          >
            <span className="flex-1 truncate">{c.label}</span>
            {checked && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The "View options" control in a view's header: a popover with the layout,
 * the sorts and the groupings as radio groups. Every view that lists tasks has one.
 */
export function ViewOptionsMenu({
  view,
  sorts,
  groups,
}: {
  view: View;
  sorts: Choice<SortKey>[];
  groups: Choice<GroupKey>[];
}) {
  const { options, sort, group, layout, set } = useViewOptions(view);
  const [open, setOpen] = useState(false);
  const custom = sort !== sorts[0].key || group !== 'default' || layout === 'board';
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="View options"
      className="p-1"
      trigger={
        <IconButton
          label="View options"
          icon={<ArrowDownUp className="size-4" />}
          className={custom ? 'text-accent' : undefined}
        />
      }
    >
      <div className="flex gap-1">
        <Choices
          label="Layout"
          choices={LAYOUTS}
          value={layout}
          onChange={(key) => set({ ...options, layout: key })}
        />
        <Choices
          label="Sort by"
          choices={sorts}
          value={sort}
          onChange={(key) => set({ ...options, sort: key })}
        />
        <Choices
          label="Group by"
          choices={groups}
          value={group}
          onChange={(key) => set({ ...options, group: key })}
        />
      </div>
    </Popover>
  );
}
