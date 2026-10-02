import { Pause, Play, Square, Timer, Watch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { pauseFocus, resumeFocus, startFocus, stopFocus } from '@/commands';
import { FocusClock } from '@/components/focus/FocusClock';
import { Button } from '@/components/ui';
import type { Item } from '@/data/types';
import { formatTimestamp } from '@/lib/dates';
import { formatFocusTotal } from '@/lib/focus';
import { useData } from '@/store/data';
import { focusSeconds, itemSessions, useFocus } from '@/store/focus';

const SHOWN = 5;
const KIND = { pomodoro: 'Pomodoro', stopwatch: 'Stopwatch' } as const;

/** Start a timer on the task, run the one that is going, and the time logged so far. */
export function FocusField({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const all = useData((s) => s.tables.focusSessions);
  const minutes = useData((s) => s.settings.focusMinutes);
  const timer = useFocus((s) => (s.timer?.itemId === item.id ? s.timer : null));
  const [expanded, setExpanded] = useState(false);
  const sessions = useMemo(() => itemSessions(all, item.id), [all, item.id]);
  const total = focusSeconds(all, item.id);
  const canStart = !readOnly && !item.checked;
  if (!timer && !canStart && !sessions.length) return null;
  const shown = expanded ? sessions : sessions.slice(0, SHOWN);
  const paused = timer?.pausedAt !== null;
  return (
    <div>
      <h2 className="mb-1.5 flex items-center text-xs font-medium text-fg-muted">
        <span className="flex-1">Focus</span>
        {total > 0 && (
          <span className="font-normal text-fg-subtle tabular-nums">{formatFocusTotal(total)}</span>
        )}
      </h2>
      {timer ? (
        <div className="flex items-center gap-2">
          <FocusClock timer={timer} className="mr-auto text-lg font-medium tabular-nums" />
          {paused && <span className="text-xs text-fg-muted">Paused</span>}
          <Button size="sm" onClick={paused ? resumeFocus : pauseFocus}>
            {paused ? (
              <Play aria-hidden className="size-3.5" />
            ) : (
              <Pause aria-hidden className="size-3.5" />
            )}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" onClick={stopFocus}>
            <Square aria-hidden className="size-3.5" />
            Stop
          </Button>
        </div>
      ) : (
        canStart && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              aria-label={`Start a ${minutes}-minute Pomodoro`}
              onClick={() => startFocus(item.id, 'pomodoro')}
            >
              <Timer aria-hidden className="size-3.5" />
              Pomodoro
            </Button>
            <Button
              size="sm"
              aria-label="Start a stopwatch"
              onClick={() => startFocus(item.id, 'stopwatch')}
            >
              <Watch aria-hidden className="size-3.5" />
              Stopwatch
            </Button>
          </div>
        )
      )}
      {sessions.length > 0 && (
        <>
          <ul aria-label="Focus sessions" className="mt-2 space-y-1 text-xs">
            {shown.map((s) => (
              <li key={s.id} className="flex gap-2 px-1">
                <span className="flex-1 text-fg">{formatTimestamp(s.startedAt)}</span>
                <span className="text-fg-subtle">{KIND[s.kind]}</span>
                <span className="tabular-nums">{formatFocusTotal(s.seconds)}</span>
              </li>
            ))}
          </ul>
          {sessions.length > SHOWN && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 rounded px-1 text-xs text-accent hover:underline"
            >
              {expanded ? 'Show fewer' : `Show all ${sessions.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
