import clsx from 'clsx';
import type { ComponentProps, ReactNode } from 'react';

export interface SidebarItemProps extends Omit<ComponentProps<'div'>, 'children'> {
  icon?: ReactNode;
  label: ReactNode;
  count?: number | null;
  active?: boolean;
  /** Indent for lists inside a folder. */
  nested?: boolean;
  /** Replaces the label, e.g. with a rename field. */
  editor?: ReactNode;
  trailing?: ReactNode;
}

export const sidebarItemClass =
  'group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * One row in the sidebar. It's a div with role="button" rather than a real
 * button so it can also be a drag handle and hold a rename field.
 */
export function SidebarItem({
  icon,
  label,
  count,
  active,
  nested,
  editor,
  trailing,
  className,
  onClick,
  onKeyDown,
  ...props
}: SidebarItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      className={clsx(
        sidebarItemClass,
        active ? 'bg-selected font-medium text-fg' : 'text-fg hover:bg-hover',
        nested && 'pl-6',
        className,
      )}
      {...props}
    >
      {icon}
      {editor ?? <span className="min-w-0 flex-1 truncate">{label}</span>}
      {trailing}
      {!editor && count ? (
        // A folder's "…" button takes this spot while the row is hovered or focused.
        <span className="text-xs text-fg-subtle tabular-nums group-focus-within/folder:invisible group-hover/folder:invisible">
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function SectionHeader({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="group/section mt-4 mb-0.5 flex h-6 items-center gap-1 pr-1 pl-2">
      <span className="flex-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
