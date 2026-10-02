import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { addDaysKey, fromDateKey, todayKey } from '@/lib/dates';
import { addHabit, toggleCheckIn } from '@/store/actions/habits';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { openList, useUI } from '@/store/ui';

let id: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  const list = createList({ type: 'habit', title: 'Routine' });
  id = addHabit(list, 'Read')!;
  // Three days in a row ending today, and one earlier day after a gap.
  for (const offset of [0, -1, -2, -5]) toggleCheckIn(id, addDaysKey(todayKey(), offset));
  useUI.setState({ view: { kind: 'today' }, dialog: null, selectedItemId: null });
  openList(list);
  useUI.setState({ selectedItemId: id, detailsOpen: true });
});

const panel = () => within(screen.getByRole('complementary', { name: 'Habit details' }));

describe('HabitDetails', () => {
  // Bug prevented: the figures counting wrongly (best streak must survive a gap).
  it('shows the current and best streak and the total', () => {
    render(<App />);
    const figure = (name: string) => panel().getByText(name).closest('div')!;
    expect(figure('Current streak')).toHaveTextContent('3 days');
    expect(figure('Best streak')).toHaveTextContent('3 days');
    expect(figure('Check-ins')).toHaveTextContent('4');
  });

  // Bug prevented: the goal picker not saving, or weekly figures still counted in days.
  it('changes the goal from the picker', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(panel().getByRole('combobox', { name: 'Goal' }), '2 times a week');
    expect(useData.getState().tables.items[id].habit).toEqual({ period: 'week', times: 2 });
    expect(panel().getByText('Current streak').closest('div')).toHaveTextContent('weeks');
  });

  // Bug prevented: the heatmap being unnamed for screen readers, or squares not saying their day.
  it('shows the past year as a named heatmap with a title on each day', () => {
    render(<App />);
    expect(panel().getByRole('img', { name: '4 check-ins in the past year' })).toBeInTheDocument();
    const day = (offset: number) =>
      format(fromDateKey(addDaysKey(todayKey(), offset)), 'd MMM yyyy');
    expect(
      panel()
        .getByRole('group', { name: 'Heatmap' })
        .querySelector(`[title="Done on ${day(0)}"]`),
    ).not.toBeNull();
    expect(
      panel()
        .getByRole('group', { name: 'Heatmap' })
        .querySelector(`[title="Not done on ${day(-3)}"]`),
    ).not.toBeNull();
  });

  // Bug prevented: task-only fields (due date, priority, subtasks) showing for a habit.
  it('shows nothing task-specific, and has a notes field', () => {
    render(<App />);
    expect(panel().queryByText('Priority')).not.toBeInTheDocument();
    expect(panel().queryByRole('button', { name: 'Add due date' })).not.toBeInTheDocument();
    expect(panel().queryByRole('textbox', { name: 'Add subtask' })).not.toBeInTheDocument();
    expect(panel().getByRole('textbox', { name: 'Habit title' })).toHaveValue('Read');
  });

  // Bug prevented: at narrow widths the row hides its day buttons, so a missed day could not
  // be filled in anywhere.
  it('toggles a past day from its Last 7 days section and the streak follows', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(panel().getByRole('heading', { name: 'Last 7 days' })).toBeInTheDocument();
    const name = (offset: number, done: boolean) =>
      `${format(fromDateKey(addDaysKey(todayKey(), offset)), 'EEE d MMM')}, ${done ? 'done' : 'not done'}`;
    // Filling the gap three and four days ago joins the run of three to a run of six.
    await user.click(panel().getByRole('button', { name: name(-3, false) }));
    await user.click(panel().getByRole('button', { name: name(-4, false) }));
    expect(panel().getByRole('button', { name: name(-3, true) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(panel().getByText('Current streak').closest('div')).toHaveTextContent('6 days');
  });
});
