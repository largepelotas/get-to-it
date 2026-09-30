import { useSyncExternalStore } from 'react';
import { msUntilTomorrow, todayKey } from '@/lib/dates';

/** Re-renders subscribers when the date changes: at midnight, and on waking or refocusing. */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    // A little past midnight, so the new day has surely begun.
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, msUntilTomorrow() + 1000);
  };
  const onFocus = () => {
    onChange();
    schedule();
  };
  schedule();
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  };
}

/** Today's date key, kept current across midnight. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, () => todayKey());
}
