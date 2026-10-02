import { useSyncExternalStore } from 'react';
import { useFocus } from '@/store/focus';

/**
 * Ticks once a second, on the second, while a timer is running (not paused),
 * and again when the window gains focus or becomes visible (timers are
 * throttled in the background). Idle otherwise.
 */
function subscribe(onChange: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | undefined;
  let align: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearInterval(interval);
    clearTimeout(align);
    interval = align = undefined;
  };
  const sync = () => {
    const { timer } = useFocus.getState();
    const running = !!timer && timer.pausedAt === null;
    if (!running) return stop();
    if (interval !== undefined || align !== undefined) return;
    // Start on the next whole second so the display doesn't skip.
    align = setTimeout(
      () => {
        align = undefined;
        onChange();
        interval = setInterval(onChange, 1000);
      },
      1000 - (Date.now() % 1000),
    );
  };
  const wake = () => onChange();
  const unsubscribe = useFocus.subscribe(() => {
    sync();
    onChange();
  });
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  sync();
  return () => {
    stop();
    unsubscribe();
    window.removeEventListener('focus', wake);
    document.removeEventListener('visibilitychange', wake);
  };
}

const currentSecond = () => Math.floor(Date.now() / 1000) * 1000;

/** The current time floored to the second, re-rendering each second while a timer runs. */
export function useFocusClock(): number {
  return useSyncExternalStore(subscribe, currentSecond);
}
