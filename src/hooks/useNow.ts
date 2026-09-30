import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE / 4);
  window.addEventListener('focus', onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', onChange);
  };
}

const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/** The current time to the minute, for showing what has passed. Re-renders as minutes go by. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, currentMinute);
}
