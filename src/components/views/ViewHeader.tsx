import type { ReactNode } from 'react';

export interface ViewHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** The top of the main pane. Its empty space drags the window. */
export function ViewHeader({ icon, title, subtitle, actions }: ViewHeaderProps) {
  return (
    <header data-tauri-drag-region className="flex shrink-0 items-center gap-3 px-8 pt-8 pb-4">
      {icon}
      <div data-tauri-drag-region className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        ) : (
          title
        )}
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 pt-24 pb-8 text-center">
      {icon && <div className="mb-3 text-fg-subtle">{icon}</div>}
      <p className="font-medium text-fg-muted">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-subtle">{children}</div>}
    </div>
  );
}
