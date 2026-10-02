import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import type { FocusSession } from '@/data/types';
import { createItem, setChecked, setWontDo } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { navigate, openDialog, useUI } from '@/store/ui';

beforeAll(() => preloadDialogs());

let work: string;
const main = () => within(screen.getByRole('main'));
const nav = () => within(screen.getByRole('navigation', { name: 'Lists' }));

// The clock is fixed to Friday 2 October 2026, noon (weeks start on Monday); only Date is faked.
const NOW = new Date(2026, 9, 2, 12);
function at(day: number, month: number, fn: () => void) {
  vi.setSystemTime(new Date(2026, month - 1, day, 9));
  fn();
  vi.setSystemTime(NOW);
}
const done = (text: string, day: number, month = 10) => {
  const id = createItem(work, { text })!;
  at(day, month, () => setChecked(id, true));
  return id;
};
function addFocus(itemId: string, day: number, month: number, seconds: number) {
  const startedAt = new Date(2026, month - 1, day, 10).getTime();
  const row: FocusSession = {
    id: `s${startedAt}`,
    itemId,
    kind: 'stopwatch',
    startedAt,
    endedAt: startedAt + seconds * 1000,
    seconds,
  };
  useData.setState((s) => ({
    tables: { ...s.tables, focusSessions: { ...s.tables.focusSessions, [row.id]: row } },
  }));
}

beforeEach(() => {
  toast.dismiss();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'stats' },
    dialog: null,
    selectedItemId: null,
    detailsOpen: false,
  });
  work = createList({ type: 'todo', title: 'Work' });
});
afterEach(() => vi.useRealTimers());

const figure = (group: string, label: string) =>
  within(within(main().getByRole('group', { name: group })).getByText(label).parentElement!);

describe('Statistics', () => {
  it('opens from the sidebar', async () => {
    navigate({ kind: 'today' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(nav().getByRole('button', { name: /^Statistics/ }));
    expect(main().getByRole('heading', { level: 1, name: 'Statistics' })).toBeInTheDocument();
  });

  it('still draws with zeros when there is nothing', () => {
    render(<App />);
    expect(figure('Tasks done', 'Today').getByText('0')).toBeInTheDocument();
    expect(figure('Focus time', 'All time').getByText('0 min')).toBeInTheDocument();
    expect(main().getByRole('img', { name: 'No tasks completed in the past year' })).toBeVisible();
  });

  // Breaks if a day is put in the wrong bucket, won't-do counts as done, or the week starts wrong.
  it('adds up today, this week and all time', () => {
    done('A', 2);
    done('B', 2);
    done('C', 28, 9); // Monday of this week
    done('D', 27, 9); // Sunday of last week
    const skipped = createItem(work, { text: 'Skipped' })!;
    at(2, 10, () => setWontDo(skipped));
    const a = Object.values(useData.getState().tables.items)[0].id;
    addFocus(a, 2, 10, 4800);
    addFocus(a, 27, 9, 600);
    render(<App />);
    expect(figure('Tasks done', 'Today').getByText('2')).toBeInTheDocument();
    expect(figure('Tasks done', 'This week').getByText('3')).toBeInTheDocument();
    expect(figure('Tasks done', 'All time').getByText('4')).toBeInTheDocument();
    expect(figure('Focus time', 'Today').getByText('1 h 20 min')).toBeInTheDocument();
    expect(figure('Focus time', 'This week').getByText('1 h 20 min')).toBeInTheDocument();
    expect(figure('Focus time', 'All time').getByText('1 h 30 min')).toBeInTheDocument();
  });

  it('lists the last 14 days in words, a day with nothing included', () => {
    done('A', 2);
    done('B', 2);
    done('C', 1);
    addFocus(Object.values(useData.getState().tables.items)[0].id, 1, 10, 4800);
    render(<App />);
    const tasks = within(main().getByRole('list', { name: 'Tasks done per day' }));
    expect(tasks.getAllByRole('listitem')).toHaveLength(14);
    expect(tasks.getByText('Fri 2 Oct: 2 tasks')).toBeInTheDocument();
    expect(tasks.getByText('Thu 1 Oct: 1 task')).toBeInTheDocument();
    expect(tasks.getByText('Wed 30 Sep: 0 tasks')).toBeInTheDocument();
    expect(tasks.getByText('Sat 19 Sep: 0 tasks')).toBeInTheDocument();
    const focus = within(main().getByRole('list', { name: 'Focus time per day' }));
    expect(focus.getByText('Thu 1 Oct: 1 h 20 min')).toBeInTheDocument();
    expect(focus.getByText('Fri 2 Oct: 0 min')).toBeInTheDocument();
  });

  it('describes the heatmap as one image, and the toggle switches what it counts', async () => {
    done('A', 2);
    done('B', 14, 3);
    done('C', 14, 3);
    done('D', 14, 3);
    addFocus(Object.values(useData.getState().tables.items)[0].id, 2, 10, 4800);
    render(<App />);
    const user = userEvent.setup();
    const image = main().getByRole('img', {
      name: '4 tasks completed in the past year, busiest day 3 on 14 Mar 2026',
    });
    expect(image.querySelector('[title="3 tasks on 14 Mar 2026"]')).not.toBeNull();
    expect(image.querySelector('[title="No tasks on 13 Mar 2026"]')).not.toBeNull();
    expect(main().getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(main().getByRole('button', { name: 'Focus time' }));
    expect(main().getByRole('button', { name: 'Focus time' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      main().getByRole('img', {
        name: '1 h 20 min of focus time in the past year, busiest day 1 h 20 min on 2 Oct 2026',
      }),
    ).toBeInTheDocument();
  });

  it('can be hidden from the sidebar in Settings, and shown again', async () => {
    const user = userEvent.setup();
    navigate({ kind: 'today' });
    render(<App />);
    expect(nav().getByRole('button', { name: /^Statistics/ })).toBeInTheDocument();
    act(() => openDialog({ kind: 'settings' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show Statistics' }));
    expect(useData.getState().settings.hiddenViews).toEqual(['stats']);
    expect(nav().queryByRole('button', { name: /^Statistics/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show Statistics' }));
    expect(useData.getState().settings.hiddenViews).toEqual([]);
  });
});
