import clsx from 'clsx';
import { Ellipsis, Flame, GripVertical } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Checkbox } from '@/components/items/Checkbox';
import type { DragBits } from '@/components/items/ItemRow';
import { ContextMenu, IconButton, Menu, type MenuEntries } from '@/components/ui';
import type { Item } from '@/data/types';
import { type DateKey } from '@/lib/dates';
import { setItemText } from '@/store/actions/items';
import { streakLabel } from '@/store/habits';
import { HabitWeek } from './HabitWeek';
import { describeHabit, progressText, type HabitStatus } from './habitStatus';

/** Where a key was pressed: on the row itself, or in its name field. */
export type HabitKeyMode = 'row' | 'name';

export interface HabitRowProps {
  item: Item;
  status: HabitStatus;
  today: DateKey;
  /** The last seven days, oldest first, ending today. */
  week: DateKey[];
  selected: boolean;
  tabbable: boolean;
  readOnly: boolean;
  drag?: DragBits;
  menu?: () => MenuEntries;
  onToggleDay: (day: DateKey) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, mode: HabitKeyMode) => void;
  onSelect: () => void;
  onOpen: () => void;
}

/** One habit: today's tick, name, goal, streak and the last seven days. */
export function HabitRow({
  item,
  status,
  today,
  week,
  selected,
  tabbable,
  readOnly,
  drag,
  menu,
  onToggleDay,
  onKeyDown,
  onSelect,
  onOpen,
}: HabitRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const doneToday = status.days.has(today);
  const descriptionId = `row-desc-${item.id}`;
  const row = (
    <div
      ref={drag?.ref}
      style={drag?.style}
      role="listitem"
      data-item-id={item.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={item.text}
      aria-describedby={descriptionId}
      aria-current={selected ? 'true' : undefined}
      onFocus={onSelect}
      onClick={(e) => {
        // Buttons do their own thing. A click anywhere else opens details; the name field
        // also keeps the click, so the name can be edited with the panel open.
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        onOpen();
        if (!target.closest('input')) e.currentTarget.focus();
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        // Space and Enter on a day button or the checkbox press that button.
        if (target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
        onKeyDown(e, target.dataset.field === 'name' ? 'name' : 'row');
      }}
      className={clsx(
        'group relative flex min-h-11 items-center gap-2 rounded-md py-1 pr-1 outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        selected ? 'bg-selected' : 'hover:bg-hover',
        drag?.dragging && 'z-10 bg-elevated shadow-popover',
      )}
    >
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
      <Checkbox
        checked={doneToday}
        disabled={readOnly}
        label={item.text}
        onChange={() => onToggleDay(today)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <input
          aria-label="Habit name"
          data-field="name"
          value={draft ?? item.text}
          readOnly={readOnly}
          tabIndex={-1}
          spellCheck
          onChange={(e) => {
            setDraft(e.target.value);
            setItemText(item.id, e.target.value);
          }}
          onBlur={() => setDraft(null)}
          className="w-full truncate bg-transparent text-sm text-fg outline-none"
        />
        <span className="truncate text-xs text-fg-muted">{progressText(status)}</span>
      </div>
      <span
        className={clsx(
          'flex shrink-0 items-center gap-1 text-xs',
          status.streak > 0 ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {status.streak > 0 && <Flame aria-hidden className="size-3.5 text-accent" />}
        {streakLabel(status.goal, status.streak)}
      </span>
      <HabitWeek
        week={week}
        days={status.days}
        readOnly={readOnly}
        // Reachable by Tab from the selected row only, so rows stay one stop each.
        tabIndex={selected ? 0 : -1}
        className="hidden @xl:flex"
        onToggleDay={onToggleDay}
      />
      <span id={descriptionId} hidden>
        {describeHabit(status, today)}
      </span>
      {menu && (
        <Menu
          align="end"
          entries={menu}
          trigger={
            <IconButton
              size="sm"
              label="Habit actions"
              tabIndex={-1}
              icon={<Ellipsis className="size-3.5" />}
              className={clsx(!selected && 'opacity-0 group-hover:opacity-100')}
            />
          }
        />
      )}
    </div>
  );
  return menu ? <ContextMenu entries={menu}>{row}</ContextMenu> : row;
}
