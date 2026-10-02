import { useEffect } from 'react';
import { announceFocusEnd } from '@/commands';
import { isFinished } from '@/lib/focus';
import { finishTimer, useFocus } from '@/store/focus';
import { useFocusClock } from './useFocusClock';

/** Ends a countdown when the clock passes its end, and announces it. Mounted once, in App. */
export function useFocusTimer(): void {
  const now = useFocusClock();
  const timer = useFocus((s) => s.timer);
  useEffect(() => {
    if (!timer || !isFinished(timer, now)) return;
    const result = finishTimer(now);
    if (result) announceFocusEnd(result);
  }, [timer, now]);
}
