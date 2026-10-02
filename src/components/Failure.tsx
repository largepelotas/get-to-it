import { Component, type ErrorInfo, type ReactNode } from 'react';
import { canBackUp, isTauri, openBackupsFolder, quitApp } from '@/platform';
import { Button } from './ui';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The whole-window screen for when the app can't go on: the data wouldn't
 * load, or a screen broke while drawing. It says what went wrong and where
 * the backups are, and uses nothing from the data store.
 */
export function Failure({ title, error }: { title: string; error: unknown }) {
  return (
    <div
      role="alert"
      className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4 p-8"
      data-tauri-drag-region
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-fg-muted">
        Nothing has been changed or deleted.
        {canBackUp && ' Checklist also keeps daily backups, which can be imported once it opens.'}
      </p>
      <pre className="max-h-40 overflow-auto rounded-md border border-line bg-elevated p-3 text-[13px] whitespace-pre-wrap select-text">
        {messageOf(error)}
      </pre>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
        {canBackUp && (
          <Button onClick={() => void openBackupsFolder().catch(console.error)}>
            Show backups
          </Button>
        )}
        {isTauri && <Button onClick={() => void quitApp()}>Quit</Button>}
      </div>
    </div>
  );
}

/** Shows `Failure` in place of the app if a screen throws while drawing. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('A screen failed to draw', error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <Failure title="Something went wrong" error={this.state.error} />;
  }
}
