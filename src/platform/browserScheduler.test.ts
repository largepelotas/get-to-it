import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserScheduler } from './browserScheduler';

afterEach(() => vi.useRealTimers());

const entry = (id: string, at: number) => ({ id, at, title: id, body: '' });

describe('BrowserScheduler', () => {
  it('fires due reminders once, even if sent again', () => {
    vi.useFakeTimers();
    let now = 0;
    const shown: string[] = [];
    const fired: string[] = [];
    const scheduler = new BrowserScheduler(
      (title) => shown.push(title),
      () => now,
    );
    scheduler.onFired(({ id, at }) => fired.push(`${id}@${at}`));
    scheduler.replace([entry('a', 1000), entry('b', 5000)]);

    now = 1500;
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual(['a']);
    expect(fired).toEqual(['a@1000']);

    scheduler.replace([entry('a', 1000), entry('b', 5000)]);
    now = 6000;
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual(['a', 'b']);

    // A snooze is a new fire time.
    scheduler.replace([entry('a', 7000)]);
    now = 7000;
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual(['a@1000', 'b@5000', 'a@7000']);
  });
});
