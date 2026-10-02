import { Check, Pause, Play, Square, Timer } from 'lucide-react';
import { completeFocusedTask, pauseFocus, resumeFocus, revealItem, stopFocus } from '@/commands';
import { Button } from '@/components/ui';
import { useData } from '@/store/data';
import { useFocus } from '@/store/focus';
import { FocusClock } from './FocusClock';

const KIND_LABEL = { pomodoro: 'Pomodoro', stopwatch: 'Stopwatch', break: '' } as const;

/** Across the top of the main pane while a timer runs, in every view. */
export function FocusBar() {
  const timer = useFocus((s) => s.timer);
  const text = useData((s) => (timer?.itemId ? s.tables.items[timer.itemId]?.text : undefined));
  if (!timer) return null;
  const paused = timer.pausedAt !== null;
  const isBreak = timer.kind === 'break';
  return (
    <div
      role="toolbar"
      aria-label="Focus timer"
      className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-4 text-sm"
    >
      <Timer aria-hidden className="size-4 shrink-0 text-accent" />
      {isBreak ? (
        <span className="font-medium">Break</span>
      ) : (
        <button
          type="button"
          onClick={() => timer.itemId && revealItem(timer.itemId)}
          className="min-w-0 truncate rounded font-medium hover:underline"
        >
          {text ?? 'Task'}
        </button>
      )}
      <span className="flex-1" />
      {KIND_LABEL[timer.kind] && <span className="text-fg-muted">{KIND_LABEL[timer.kind]}</span>}
      <FocusClock timer={timer} />
      {paused && <span className="text-fg-muted">Paused</span>}
      <Button size="sm" variant="ghost" onClick={paused ? resumeFocus : pauseFocus}>
        {paused ? (
          <Play aria-hidden className="size-3.5" />
        ) : (
          <Pause aria-hidden className="size-3.5" />
        )}
        {paused ? 'Resume' : 'Pause'}
      </Button>
      <Button size="sm" variant="ghost" onClick={stopFocus}>
        <Square aria-hidden className="size-3.5" />
        Stop
      </Button>
      {!isBreak && (
        <Button size="sm" variant="ghost" onClick={completeFocusedTask}>
          <Check aria-hidden className="size-3.5" />
          Done
        </Button>
      )}
    </div>
  );
}
