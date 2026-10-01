import clsx from 'clsx';
import { ChevronRight, Ellipsis, GripVertical, Plus } from 'lucide-react';
import { type KeyboardEvent } from 'react';
import { RenameField } from '@/components/sidebar/RenameField';
import { ContextMenu, IconButton, Menu } from '@/components/ui';
import type { Section } from '@/data/types';
import { setSectionCollapsed } from '@/store/actions/sections';
import type { DragBits } from './ItemRow';
import { sectionMenuEntries, type SectionActions } from './sectionMenu';

const icon = 'size-3.5';

export interface SectionHeadingProps {
  section: Section;
  /** Open top-level tasks in the section. */
  count: number;
  /** Archived or in the Trash: collapsing is all that works. */
  readOnly: boolean;
  tabbable: boolean;
  renaming: boolean;
  drag?: DragBits;
  actions: SectionActions;
  onRenameDone: (title: string | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/** A section's heading row: collapse toggle, title, count, and (on hover or focus) its buttons. */
export function SectionHeading({
  section,
  count,
  readOnly,
  tabbable,
  renaming,
  drag,
  actions,
  onRenameDone,
  onKeyDown,
}: SectionHeadingProps) {
  const tasks = `${count} ${count === 1 ? 'task' : 'tasks'}`;
  const row = (
    <div
      ref={drag?.ref}
      style={drag?.style}
      role="heading"
      aria-level={2}
      aria-label={`${section.title}, ${tasks}`}
      data-section-id={section.id}
      tabIndex={tabbable ? 0 : -1}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, input')) e.currentTarget.focus();
      }}
      className={clsx(
        'group relative flex h-8 items-center gap-1.5 rounded-md pr-1 outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        drag?.dragging ? 'z-10 bg-elevated shadow-popover' : 'hover:bg-hover',
      )}
    >
      {drag && !readOnly ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Drag to move section"
          {...drag.handle}
          className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-fg-subtle opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${section.collapsed ? 'Expand' : 'Collapse'} ${section.title}`}
        aria-expanded={!section.collapsed}
        onClick={() => setSectionCollapsed(section.id, !section.collapsed)}
        className="-ml-1 flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg"
      >
        <ChevronRight
          aria-hidden
          className={clsx('size-3.5 transition-transform', !section.collapsed && 'rotate-90')}
        />
      </button>
      {renaming ? (
        <RenameField
          initial={section.title}
          label="Section name"
          onCommit={(value) => onRenameDone(value)}
          onDone={() => onRenameDone(null)}
        />
      ) : (
        <span
          onDoubleClick={() => !readOnly && actions.rename()}
          className="min-w-0 truncate text-sm font-semibold text-fg"
        >
          {section.title}
        </span>
      )}
      <span aria-hidden className="text-xs text-fg-subtle tabular-nums">
        {count}
      </span>
      <span className="min-w-0 flex-1 self-stretch" />
      {!readOnly && (
        <>
          <IconButton
            size="sm"
            label="Add task"
            tabIndex={-1}
            tooltip={false}
            icon={<Plus className={icon} />}
            onClick={actions.addTask}
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          />
          <Menu
            align="end"
            entries={() => sectionMenuEntries(actions)}
            trigger={
              <IconButton
                size="sm"
                label="Section actions"
                tabIndex={-1}
                tooltip={false}
                icon={<Ellipsis className={icon} />}
                className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              />
            }
          />
        </>
      )}
    </div>
  );
  return readOnly ? (
    row
  ) : (
    <ContextMenu entries={() => sectionMenuEntries(actions)}>{row}</ContextMenu>
  );
}
