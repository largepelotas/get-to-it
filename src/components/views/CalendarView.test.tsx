import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, setSetting, useData } from '@/store/data';
import { navigate, openDialog, useUI } from '@/store/ui';

let work: string;
let home: string;
const main = () => within(screen.getByRole('main'));
const nav = () => within(screen.getByRole('navigation', { name: 'Lists' }));
const day = (name: string) => within(screen.getByRole('region', { name }));

// The clock is fixed to Friday 2 October 2026 (weeks start on Monday), so the
// grid always runs from Mon 28 Sep to Sun 1 Nov.
beforeEach(() => {
  toast.dismiss();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 12));
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'calendar' },
    dialog: null,
    selectedItemId: null,
    detailsOpen: false,
  });
  work = createList({ type: 'todo', title: 'Work' });
  home = createList({ type: 'todo', title: 'Home' });
  createItem(work, { text: 'Standup', dueDate: '2026-10-02', dueTime: '09:30' });
  createItem(home, { text: 'Pay rent', dueDate: '2026-10-01' });
  createItem(work, { text: 'Next month', dueDate: '2026-11-03' });
  createItem(work, { text: 'Someday' });
  createItem(home, { text: 'Tidy' });
});
afterEach(() => vi.useRealTimers());

describe('Calendar', () => {
  it('opens from the sidebar', async () => {
    navigate({ kind: 'today' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(nav().getByRole('button', { name: /^Calendar/ }));
    expect(main().getByRole('heading', { name: 'Calendar', level: 1 })).toBeInTheDocument();
    expect(main().getByText('October 2026')).toBeInTheDocument();
  });

  it('shows the month’s weeks with tasks under their days', () => {
    render(<App />);
    expect(main().getAllByRole('region')).toHaveLength(35);
    const friday = day('Friday, October 2, 1 task');
    expect(friday.getByRole('button', { name: 'Standup' })).toBeInTheDocument();
    expect(friday.getByText(/9:30/)).toBeInTheDocument();
    expect(friday.getByText('2')).toHaveAttribute('aria-current', 'date');
    expect(
      day('Thursday, October 1, 1 task').getByRole('button', { name: 'Pay rent' }),
    ).toBeInTheDocument();
    // Another month's task is not in this grid; an empty day has no count.
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Saturday, October 3' })).toBeInTheDocument();
    // The 1st carries the month name.
    expect(day('Thursday, October 1, 1 task').getByText('Oct 1')).toBeInTheDocument();
  });

  it('moves by month, and Today returns', async () => {
    const user = userEvent.setup();
    render(<App />);
    const today = main().getByRole('button', { name: 'Today' });
    expect(today).toBeDisabled();
    await user.click(main().getByRole('button', { name: 'Next' }));
    expect(main().getByText('November 2026')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(today).toBeEnabled();
    await user.click(main().getByRole('button', { name: 'Previous' }));
    await user.click(main().getByRole('button', { name: 'Previous' }));
    expect(main().getByText('September 2026')).toBeInTheDocument();
    await user.click(today);
    expect(main().getByText('October 2026')).toBeInTheDocument();
  });

  it('switches layout, saves it, and shows the placeholder', async () => {
    const user = userEvent.setup();
    render(<App />);
    const layout = within(main().getByRole('group', { name: 'Layout' }));
    expect(layout.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(layout.getByRole('button', { name: 'Week' }));
    expect(useData.getState().settings.calendarLayout).toBe('week');
    expect(main().getByText('Sep 28 – Oct 4, 2026')).toBeInTheDocument();
    expect(main().getByText('Week and 3-day layouts are coming.')).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Next' }));
    expect(main().getByText('Oct 5 – 11, 2026')).toBeInTheDocument();
    await user.click(layout.getByRole('button', { name: '3 days' }));
    expect(useData.getState().settings.calendarLayout).toBe('days');
    expect(layout.getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(layout.getByRole('button', { name: 'Month' }));
    expect(main().queryByText('Week and 3-day layouts are coming.')).not.toBeInTheDocument();
  });

  it('shows undated tasks by list in the Tasks panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Unscheduled tasks' })).toBeNull();
    await user.click(main().getByRole('button', { name: 'Tasks' }));
    const panel = within(screen.getByRole('complementary', { name: 'Unscheduled tasks' }));
    expect(panel.getByRole('heading', { name: 'Unscheduled' })).toBeInTheDocument();
    expect(panel.getByRole('region', { name: 'Work' })).toBeInTheDocument();
    expect(within(panel.getByRole('region', { name: 'Work' })).getByText('Someday')).toBeVisible();
    expect(within(panel.getByRole('region', { name: 'Home' })).getByText('Tidy')).toBeVisible();
    expect(panel.queryByText('Standup')).not.toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Tasks' }));
    expect(screen.queryByRole('complementary', { name: 'Unscheduled tasks' })).toBeNull();
  });

  it('opens a task’s details when its chip is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(day('Friday, October 2, 1 task').getByRole('button', { name: 'Standup' }));
    expect(useUI.getState().detailsOpen).toBe(true);
    expect(await screen.findByRole('complementary', { name: /details/i })).toBeInTheDocument();
  });

  it('describes a chip with its date, time and list', () => {
    render(<App />);
    expect(
      day('Friday, October 2, 1 task').getByRole('button', { name: 'Standup' }),
    ).toHaveAttribute('aria-description', expect.stringMatching(/^Due Today.*In Work$/));
  });

  it('can be hidden from the sidebar in Settings', async () => {
    const user = userEvent.setup();
    navigate({ kind: 'today' });
    render(<App />);
    expect(nav().getByRole('button', { name: /^Calendar/ })).toBeInTheDocument();
    act(() => openDialog({ kind: 'settings' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show Calendar' }));
    expect(useData.getState().settings.hiddenViews).toEqual(['calendar']);
    expect(nav().queryByRole('button', { name: /^Calendar/ })).not.toBeInTheDocument();
  });

  it('starts in the saved layout', () => {
    setSetting('calendarLayout', 'week');
    render(<App />);
    expect(main().getByText('Week and 3-day layouts are coming.')).toBeInTheDocument();
  });
});
