/**
 * The browser preview's stand-in for the native reminder scheduler
 * (`src-tauri/src/reminders.rs`), with the same behaviour: it checks the
 * clock every second, fires what's due and ignores reminders sent again
 * after they fired.
 */

export interface ScheduledReminder {
  id: string;
  /** Unix time in milliseconds. */
  at: number;
  title: string;
  body: string;
}

type FiredListener = (fired: { id: string; at: number }) => void;

const key = (r: { id: string; at: number }) => `${r.id}@${r.at}`;

export class BrowserScheduler {
  private entries: ScheduledReminder[] = [];
  private fired = new Set<string>();
  private listeners = new Set<FiredListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly show: (title: string, body: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  replace(entries: ScheduledReminder[]): void {
    const keys = new Set(entries.map(key));
    for (const k of this.fired) if (!keys.has(k)) this.fired.delete(k);
    this.entries = entries.filter((r) => !this.fired.has(key(r)));
    if (this.entries.length && !this.timer) this.timer = setInterval(() => this.tick(), 1000);
    if (!this.entries.length && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick(): void {
    const now = this.now();
    const due = this.entries.filter((r) => r.at <= now);
    if (!due.length) return;
    this.entries = this.entries.filter((r) => r.at > now);
    for (const r of due) {
      this.fired.add(key(r));
      this.show(r.title, r.body);
      for (const listener of this.listeners) listener({ id: r.id, at: r.at });
    }
  }

  onFired(listener: FiredListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
