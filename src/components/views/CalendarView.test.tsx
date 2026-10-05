import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { createItem } from '@/store/actions/items';
import { formatShortTime, formatTime, formatTimeRange } from '@/lib/dates';
import { createList } from '@/store/actions/lists';
import { resetForTests, setSetting, useData } from '@/store/data';
import { resetFeedsForTests, useFeeds } from '@/store/feeds';
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
  resetFeedsForTests();
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

function event(id: string, date: string, startTime: string, endTime: string) {
  return { id, title: id.toUpperCase(), date, startTime, endTime, location: 'Room 4' };
}
function setFeedEvents(events: ReturnType<typeof event>[]) {
  useFeeds.setState({ feeds: { F: { status: 'ok', error: null, fetchedAt: 1, events } } });
}

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

  it('switches layout and saves it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const layout = within(main().getByRole('group', { name: 'Layout' }));
    expect(layout.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(layout.getByRole('button', { name: 'Week' }));
    expect(useData.getState().settings.calendarLayout).toBe('week');
    expect(main().getByText('Sep 28 – Oct 4, 2026')).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Next' }));
    expect(main().getByText('Oct 5 – 11, 2026')).toBeInTheDocument();
    await user.click(layout.getByRole('button', { name: '3 days' }));
    expect(useData.getState().settings.calendarLayout).toBe('days');
    expect(layout.getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(layout.getByRole('button', { name: 'Month' }));
    expect(main().getByText('October 2026')).toBeInTheDocument();
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
    expect(main().getAllByRole('heading', { level: 2 })).toHaveLength(7);
  });
});

describe('Calendar week and 3-day layouts', () => {
  const headings = () => main().getAllByRole('heading', { level: 2 });

  // Bug prevented: the week layout missing days, or marking the wrong day as today.
  it('shows seven day headings with today marked', () => {
    setSetting('calendarLayout', 'week');
    render(<App />);
    expect(headings().map((h) => h.textContent)).toEqual([
      'Mon28',
      'Tue29',
      'Wed30',
      'Thu1',
      'Fri2',
      'Sat3',
      'Sun4',
    ]);
    expect(within(headings()[4]).getByText('2')).toHaveAttribute('aria-current', 'date');
    expect(main().getAllByText('2', { selector: '[aria-current]' })).toHaveLength(1);
  });

  // Bug prevented: a timed task shown as a one-line chip with no range, or in the all-day row.
  it('draws a timed task as a block with its range, and an untimed one in the all-day row', () => {
    setSetting('calendarLayout', 'week');
    createItem(work, {
      text: 'Review',
      dueDate: '2026-10-02',
      dueTime: '14:00',
      endTime: '15:30',
    });
    render(<App />);
    const friday = within(screen.getByRole('region', { name: 'Friday, October 2' }));
    const block = friday.getByRole('button', { name: 'Review' });
    // Bug prevented: the end time crowding the title in a block; the height already shows it.
    expect(block).toHaveTextContent(`${formatShortTime('14:00')} Review`);
    expect(block).not.toHaveTextContent(formatTime('15:30'));
    expect(block).toHaveAttribute('title', `${formatTime('14:00')}\u2013${formatTime('15:30')}`);
    // 14:00 is 14 * 48 px down; 90 minutes is 72 px tall.
    expect(block.closest('li')).toHaveStyle({ top: '672px', height: '72px' });
    const allDay = within(screen.getByRole('group', { name: 'All day, Thursday, October 1' }));
    expect(allDay.getByRole('button', { name: 'Pay rent' })).toBeInTheDocument();
    expect(friday.queryByRole('button', { name: 'Pay rent' })).not.toBeInTheDocument();
  });

  // Bug prevented: overlapping tasks drawn on top of each other at the same left edge.
  it('puts overlapping tasks side by side', () => {
    setSetting('calendarLayout', 'week');
    createItem(work, { text: 'One', dueDate: '2026-10-03', dueTime: '09:00', endTime: '10:00' });
    createItem(work, { text: 'Two', dueDate: '2026-10-03', dueTime: '09:30' });
    render(<App />);
    const friday = within(screen.getByRole('region', { name: 'Saturday, October 3' }));
    const left = (name: string) => friday.getByRole('button', { name }).closest('li')!.style.left;
    expect(left('One')).toBe('0%');
    expect(left('Two')).toBe('50%');
  });

  // Bug prevented: the 3-day layout starting from the wrong day or not moving by 3 days.
  it('shows three days from the anchor and moves by three', async () => {
    setSetting('calendarLayout', 'days');
    const user = userEvent.setup();
    render(<App />);
    expect(headings().map((h) => h.textContent)).toEqual(['Fri2', 'Sat3', 'Sun4']);
    expect(main().getByText('Oct 2 – 4, 2026')).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Next' }));
    expect(main().getByText('Oct 5 – 7, 2026')).toBeInTheDocument();
  });

  // Bug prevented: the current-time line drawn in every column, or missing from today's.
  it('draws the current-time line in today’s column only', () => {
    setSetting('calendarLayout', 'week');
    render(<App />);
    const lines = screen.getAllByTestId('now-line');
    expect(lines).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Friday, October 2' })).toContainElement(lines[0]);
    // 12:00 is 12 * 48 px down, less half the 2px line.
    expect(lines[0]).toHaveStyle({ top: '575px' });
  });

  // Bug prevented: events missing from their day, or drawn like tasks (with a checkbox or a drag handle).
  it('shows an event from a calendar link on its day with no task controls', () => {
    setSetting('calendarFeeds', [{ id: 'F', name: 'Team', url: 'https://example.test/c.ics' }]);
    useFeeds.setState({
      feeds: {
        F: {
          status: 'ok',
          error: null,
          fetchedAt: 1,
          events: [
            {
              id: 'e1',
              title: 'Planning',
              date: '2026-10-02',
              startTime: '10:00',
              endTime: '11:00',
              location: 'Room 4',
            },
          ],
        },
      },
    });
    render(<App />);
    const friday = day('Friday, October 2, 1 task, 1 event');
    const chip = friday.getByRole('button', { name: /^Planning, .*, Team$/ });
    expect(chip).toHaveAttribute('title', expect.stringContaining('Room 4'));
    expect(chip).not.toHaveAttribute('aria-roledescription');
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(friday.getAllByRole('button')).toHaveLength(2);
    expect(day('Saturday, October 3').queryByRole('button', { name: /Planning/ })).toBeNull();
  });

  // Bug prevented: month chips crowding the title with a full "10:00 AM–11:00 AM" range.
  it('shows only the short start time in month chips, the full range on hover', () => {
    setSetting('calendarFeeds', [{ id: 'F', name: 'Team', url: 'https://example.test/c.ics' }]);
    setFeedEvents([event('e1', '2026-10-02', '14:00', '15:00')]);
    render(<App />);
    const friday = day('Friday, October 2, 1 task, 1 event');
    expect(friday.getByText(formatShortTime('14:00'))).toBeInTheDocument();
    expect(friday.queryByText(formatTime('15:00'), { exact: false })).toBeNull();
    const chip = friday.getByRole('button', { name: /^E1, .*, Team$/ });
    expect(chip).toHaveAttribute('title', `${formatTimeRange('14:00', '15:00')}, Room 4`);
    expect(friday.getByText(formatShortTime('09:30'))).toBeInTheDocument();
    expect(friday.getByRole('button', { name: 'Standup' })).toHaveAttribute(
      'title',
      formatTime('09:30'),
    );
  });

  // Bug prevented: events that cannot be opened, or that open an editable task panel.
  it('opens a read-only pop-up with the event details when clicked', async () => {
    setSetting('calendarFeeds', [{ id: 'F', name: 'Team', url: 'https://example.test/c.ics' }]);
    setFeedEvents([event('e1', '2026-10-02', '14:00', '15:00')]);
    const user = userEvent.setup();
    render(<App />);
    const chip = day('Friday, October 2, 1 task, 1 event').getByRole('button', {
      name: /^E1, /,
    });
    await user.click(chip);
    const pop = within(screen.getByRole('dialog', { name: 'E1' }));
    expect(pop.getByRole('heading', { name: 'E1' })).toBeInTheDocument();
    expect(pop.getByText(/Friday, October 2/)).toBeInTheDocument();
    expect(pop.getByText(/2:00 PM.*3:00 PM|14:00.*15:00/)).toBeInTheDocument();
    expect(pop.getByText('Room 4')).toBeInTheDocument();
    expect(pop.getByText('Team')).toBeInTheDocument();
    expect(pop.queryByRole('textbox')).toBeNull();
    expect(useUI.getState().detailsOpen).toBe(false);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'E1' })).toBeNull();
    expect(chip).toHaveFocus();
  });

  // Bug prevented: a busy day stretching its whole week, or hiding entries with no way to reach them.
  it('shows at most three entries a day, with the rest behind "+N more"', async () => {
    for (let i = 1; i <= 4; i++) createItem(work, { text: `Task ${i}`, dueDate: '2026-10-06' });
    for (let i = 1; i <= 3; i++) createItem(home, { text: `Fits ${i}`, dueDate: '2026-10-07' });
    const user = userEvent.setup();
    render(<App />);
    const four = day('Tuesday, October 6, 4 tasks');
    expect(
      four.getAllByRole('button').filter((b) => /^Task \d$/.test(b.textContent ?? '')),
    ).toHaveLength(3);
    const more = four.getByRole('button', { name: '1 more on Tuesday, October 6' });
    expect(more).toHaveTextContent('+1 more');
    const three = day('Wednesday, October 7, 3 tasks');
    expect(three.getAllByRole('button')).toHaveLength(3);
    expect(three.queryByText(/more/)).toBeNull();

    await user.click(more);
    const pop = within(screen.getByRole('dialog', { name: 'Tuesday, October 6' }));
    expect(pop.getByRole('heading', { name: 'Tuesday, October 6' })).toBeInTheDocument();
    for (let i = 1; i <= 4; i++)
      expect(pop.getByRole('button', { name: `Task ${i}` })).toBeInTheDocument();
    // Tasks in the pop-up are not draggable (the cell's own chip is).
    expect(pop.getByRole('button', { name: 'Task 4' })).not.toHaveAttribute('aria-roledescription');

    await user.click(pop.getByRole('button', { name: 'Task 4' }));
    expect(useUI.getState().detailsOpen).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Tuesday, October 6' })).toBeNull();
  });

  // Bug prevented: a long title cut to one line in a month cell, hiding most of it.
  it('lets month titles wrap to two lines', () => {
    createItem(work, { text: 'A long title', dueDate: '2026-10-06' });
    render(<App />);
    const chip = day('Tuesday, October 6, 1 task').getByRole('button', { name: 'A long title' });
    expect(chip.querySelector('.line-clamp-2')).not.toBeNull();
  });

  // Bug prevented: an all-day event losing its location from the hover text.
  it('puts "All day" and the location in an all-day event hover text', () => {
    setSetting('calendarFeeds', [{ id: 'F', name: 'Team', url: 'https://example.test/c.ics' }]);
    setFeedEvents([{ ...event('e1', '2026-10-02', '14:00', '15:00'), startTime: null as never }]);
    render(<App />);
    const chip = day('Friday, October 2, 1 task, 1 event').getByRole('button', { name: /^E1, / });
    expect(chip).toHaveAttribute('title', 'All day, Room 4');
  });

  // Bug prevented: an event inside the "+N more" pop-up that cannot be opened.
  it('opens an event from inside the "+N more" pop-up', async () => {
    for (let i = 1; i <= 3; i++) createItem(work, { text: `Task ${i}`, dueDate: '2026-10-06' });
    setSetting('calendarFeeds', [{ id: 'F', name: 'Team', url: 'https://example.test/c.ics' }]);
    setFeedEvents([event('e1', '2026-10-06', '08:00', '09:00')]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      day('Tuesday, October 6, 3 tasks, 1 event').getByRole('button', { name: /more on/ }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Tuesday, October 6' })).getByRole('button', {
        name: /^E1, /,
      }),
    );
    expect(screen.getByRole('dialog', { name: 'E1' })).toBeInTheDocument();
  });
});
