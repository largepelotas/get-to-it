import { useFocusClock } from '@/hooks/useFocusClock';
import { clockSeconds, formatClock, type FocusTimer } from '@/lib/focus';

/** "24 minutes left", "1 minute on the clock", for a screen reader to read once. */
function spoken(timer: FocusTimer, seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const amount = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  if (minutes === 0)
    return timer.minutes === null ? 'Under a minute on the clock' : 'Under a minute left';
  return timer.minutes === null ? `${amount} on the clock` : `${amount} left`;
}

/**
 * The timer's clock. It is not a live region: updating every second would
 * flood a screen reader, so the label gives the time once, when it is read.
 */
export function FocusClock({ timer, className }: { timer: FocusTimer; className?: string }) {
  const now = useFocusClock();
  const seconds = clockSeconds(timer, now);
  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={spoken(timer, seconds)}
      className={className ?? 'tabular-nums'}
    >
      {formatClock(seconds)}
    </span>
  );
}
