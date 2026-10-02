import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { preloadDialogs } from '@/components/dialogs/lazy';
import { MemoryRepository } from '@/data/memory';
import { createItem, setChecked, setWontDo } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { formatTime } from '@/lib/dates';
import { resetForTests, useData } from '@/store/data';
import { navigate, openDialog, useUI } from '@/store/ui';

beforeAll(() => preloadDialogs());

let work: string;
const main = () => within(screen.getByRole('main'));
const nav = () => within(screen.getByRole('navigation', { name: 'Lists' }));
const find = (text: string) =>
  Object.values(useData.getState().tables.items).find((i) => i.text === text)!;

// The clock is fixed to Friday 2 October 2026, noon; only Date is faked.
const NOW = new Date(2026, 9, 2, 12);
/** Runs `fn` with the clock set to a moment on a day relative to the fixed today. */
function at(daysAgo: number, hour: number, minute: number, fn: () => void) {
  vi.setSystemTime(new Date(2026, 9, 2 - daysAgo, hour, minute));
  fn();
  vi.setSystemTime(NOW);
}
const done = (text: string, daysAgo: number, hour = 9, minute = 0) => {
  const id = createItem(work, { text })!;
  at(daysAgo, hour, minute, () => setChecked(id, true));
  return id;
};

beforeEach(() => {
  toast.dismiss();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'completed' },
    dialog: null,
    selectedItemId: null,
    detailsOpen: false,
  });
  work = createList({ type: 'todo', title: 'Work' });
});
afterEach(() => vi.useRealTimers());

describe('Completed', () => {
  it('opens from the sidebar and shows the empty state', async () => {
    navigate({ kind: 'today' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(nav().getByRole('button', { name: /^Completed/ }));
    expect(main().getByRole('heading', { level: 1, name: 'Completed' })).toBeInTheDocument();
    expect(main().getByText('Nothing finished yet.')).toBeInTheDocument();
  });

  // Breaks if tasks are listed under the wrong day or the headings lose their names.
  it('groups tasks by the day they were finished, newest first, with a count', () => {
    done('Report', 0, 9, 30);
    done('Email', 0, 11, 15);
    done('Invoice', 1);
    done('Tax return', 3);
    render(<App />);
    const headings = main().getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Today2',
      'Yesterday1',
      'Tuesday, September 291',
    ]);
    const today = within(screen.getByRole('region', { name: 'Today2' }));
    const rows = today.getAllByRole('listitem').map((r) => r.getAttribute('aria-label'));
    expect(rows).toEqual(['Email', 'Report']);
    expect(today.getAllByText('Work')).toHaveLength(2);
    expect(today.getByText(formatTime('11:15'))).toBeInTheDocument();
    expect(main().getByText('4 tasks in the last 30 days')).toBeInTheDocument();
  });

  it('shows a won’t-do task struck through, and a repeat without a checkbox', () => {
    const skipped = createItem(work, { text: 'Cancelled call' })!;
    at(0, 10, 0, () => setWontDo(skipped));
    const water = createItem(work, {
      text: 'Water plants',
      dueDate: '2026-10-02',
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    })!;
    at(0, 8, 0, () => setChecked(water, true));
    done('Plain', 0, 7);
    render(<App />);
    const wont = main().getByRole('listitem', { name: 'Cancelled call' });
    expect(within(wont).getByText('Cancelled call')).toHaveClass('line-through');
    expect(within(wont).getByText('Won’t do')).toBeInTheDocument();
    expect(wont).toHaveAttribute(
      'aria-description',
      expect.stringMatching(/^Won't do .*\. In Work\.$/),
    );

    const repeat = main().getByRole('listitem', { name: 'Water plants' });
    expect(within(repeat).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(repeat).toHaveAttribute(
      'aria-description',
      expect.stringMatching(/^Repeating task, completed .*\. In Work\.$/),
    );

    const plain = main().getByRole('listitem', { name: 'Plain' });
    expect(within(plain).getByRole('checkbox', { name: 'Plain' })).toBeChecked();
    expect(plain).toHaveAttribute('aria-description', `Completed ${formatTime('07:00')}. In Work.`);
  });

  // Breaks if unticking leaves the task finished, or the row stays on screen.
  it('puts a task back in its list when unticked', async () => {
    done('Report', 0);
    render(<App />);
    const user = userEvent.setup();
    await user.click(main().getByRole('checkbox', { name: 'Report' }));
    expect(find('Report')).toMatchObject({ checked: false, completedAt: null });
    expect(main().queryByRole('listitem', { name: 'Report' })).not.toBeInTheDocument();
  });

  // Breaks if older tasks are unreachable, or the button stays when nothing is older.
  it('shows the last 30 days and adds 30 more with "Show earlier"', async () => {
    done('Recent', 5);
    done('Old', 45);
    render(<App />);
    const user = userEvent.setup();
    expect(main().queryByRole('listitem', { name: 'Old' })).not.toBeInTheDocument();
    expect(main().getByText('1 task in the last 30 days')).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Show earlier' }));
    expect(main().getByRole('listitem', { name: 'Old' })).toBeInTheDocument();
    expect(main().getByText('2 tasks in the last 60 days')).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Show earlier' })).not.toBeInTheDocument();
  });

  it('opens the task in its list with the details open when its text is clicked', async () => {
    const id = done('Report', 0);
    render(<App />);
    const user = userEvent.setup();
    await user.click(main().getByRole('button', { name: 'Report' }));
    expect(useUI.getState().view).toEqual({ kind: 'list', listId: work });
    expect(useUI.getState()).toMatchObject({ selectedItemId: id, detailsOpen: true });
  });

  it('can be hidden from the sidebar in Settings, and shown again', async () => {
    const user = userEvent.setup();
    navigate({ kind: 'today' });
    render(<App />);
    expect(nav().getByRole('button', { name: /^Completed/ })).toBeInTheDocument();
    act(() => openDialog({ kind: 'settings' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show Completed' }));
    expect(useData.getState().settings.hiddenViews).toEqual(['completed']);
    expect(nav().queryByRole('button', { name: /^Completed/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show Completed' }));
    expect(useData.getState().settings.hiddenViews).toEqual([]);
  });
});
