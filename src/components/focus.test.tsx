import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { useFocus } from '@/store/focus';
import { openDialog, openList, useUI } from '@/store/ui';

const T0 = new Date(2026, 9, 5, 12, 0).getTime();
let list: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  resetForTests(new MemoryRepository());
  useFocus.setState({ timer: null });
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    detailsOpen: false,
    multiSelectedIds: [],
  });
  list = createList({ type: 'todo', title: 'Tasks' });
  openList(list);
  createItem(list, { text: 'Write plan' });
});

afterEach(() => vi.useRealTimers());

const find = (text: string) =>
  Object.values(useData.getState().tables.items).find((i) => i.text === text) as Item;
const sessions = () => Object.values(useData.getState().tables.focusSessions);
const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

async function openPanel() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    within(screen.getByRole('listitem', { name: 'Write plan' })).getByRole('button', {
      name: 'Open details',
    }),
  );
  const panel = within(screen.getByRole('complementary', { name: 'Task details' }));
  return { user, panel };
}

const bar = () => screen.queryByRole('toolbar', { name: 'Focus timer' });

describe('the focus timer', () => {
  // Bug prevented: a started timer showing nowhere, so the user can't tell it is running.
  it('starts a Pomodoro from the details panel and shows the bar', async () => {
    const { user, panel } = await openPanel();
    await user.click(panel.getByRole('button', { name: 'Start a 25-minute Pomodoro' }));

    const toolbar = within(screen.getByRole('toolbar', { name: 'Focus timer' }));
    expect(toolbar.getByRole('button', { name: 'Write plan' })).toBeInTheDocument();
    expect(toolbar.getByText('Pomodoro')).toBeInTheDocument();
    expect(toolbar.getByText('25:00')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Write plan' })).toHaveAccessibleDescription(
      'Focus timer running',
    );
    expect(panel.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  // Bug prevented: paused time counted as focused time, or a stop that logs nothing.
  it('pauses, resumes and stops, logging the focused minutes', async () => {
    const { user, panel } = await openPanel();
    await user.click(panel.getByRole('button', { name: 'Start a 25-minute Pomodoro' }));
    await user.click(panel.getByRole('button', { name: 'Pause' }));
    advance(10);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(
      within(screen.getByRole('toolbar', { name: 'Focus timer' })).getByText('25:00'),
    ).toBeVisible();
    await user.click(panel.getByRole('button', { name: 'Resume' }));
    advance(90);
    await user.click(panel.getByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Logged 2 min on “Write plan”')).toBeInTheDocument();
    expect(bar()).toBeNull();
    expect(panel.getByRole('heading', { name: /^Focus/ })).toHaveTextContent('2 min');
    expect(
      within(panel.getByRole('list', { name: 'Focus sessions' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(sessions()).toHaveLength(1);
  });

  // Bug prevented: a few seconds of fiddling being logged as a focus session.
  it('does not log a stop under a minute', async () => {
    const { user, panel } = await openPanel();
    await user.click(panel.getByRole('button', { name: 'Start a 25-minute Pomodoro' }));
    advance(20);
    await user.click(panel.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Stopped · under a minute, not logged')).toBeInTheDocument();
    expect(sessions()).toHaveLength(0);
    expect(panel.queryByRole('list', { name: 'Focus sessions' })).toBeNull();
  });

  // Bug prevented: Done on the bar completing the task but dropping the time on it.
  it('completes the task from the bar and logs the time', async () => {
    const { user, panel } = await openPanel();
    await user.click(panel.getByRole('button', { name: 'Start a stopwatch' }));
    advance(90);
    await user.click(
      within(screen.getByRole('toolbar', { name: 'Focus timer' })).getByRole('button', {
        name: 'Done',
      }),
    );
    expect(find('Write plan').checked).toBe(true);
    expect(sessions()).toMatchObject([{ seconds: 90 }]);
    expect(bar()).toBeNull();
  });

  // Bug prevented: a finished countdown ending silently, with no way on to a break.
  it('announces a finished Pomodoro and starts a break from the toast', async () => {
    const { user, panel } = await openPanel();
    await user.click(panel.getByRole('button', { name: 'Start a 25-minute Pomodoro' }));
    advance(25 * 60 + 1);
    act(() => void window.dispatchEvent(new Event('focus')));

    expect(
      await screen.findByText('Pomodoro done · 25 min logged on “Write plan”'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start break' }));
    const toolbar = within(screen.getByRole('toolbar', { name: 'Focus timer' }));
    expect(toolbar.getByText('Break')).toBeInTheDocument();
    expect(toolbar.getByText('5:00')).toBeInTheDocument();
  });

  // Bug prevented: F and Shift+F doing nothing on a focused row.
  it('starts a Pomodoro with F and a stopwatch with Shift+F', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('listitem', { name: 'Write plan' }).focus();
    await user.keyboard('f');
    expect(
      within(screen.getByRole('toolbar', { name: 'Focus timer' })).getByText('25:00'),
    ).toBeVisible();
    expect(useFocus.getState().timer?.kind).toBe('pomodoro');

    screen.getByRole('listitem', { name: 'Write plan' }).focus();
    await user.keyboard('{Shift>}F{/Shift}');
    const toolbar = within(screen.getByRole('toolbar', { name: 'Focus timer' }));
    expect(toolbar.getByText('Stopwatch')).toBeInTheDocument();
    expect(toolbar.getByText('0:00')).toBeInTheDocument();
  });
});

describe('focus settings', () => {
  // Bug prevented: the Pomodoro length setting not reaching the start button, or an invalid length being saved.
  it('saves a valid Pomodoro length and ignores 0', async () => {
    const { user } = await openPanel();
    act(() => openDialog({ kind: 'settings' }));
    const field = await screen.findByLabelText('Pomodoro length (minutes)');
    await user.clear(field);
    await user.type(field, '40');
    expect(useData.getState().settings.focusMinutes).toBe(40);
    await user.clear(field);
    await user.type(field, '0');
    expect(useData.getState().settings.focusMinutes).toBe(40);
    fireEvent.blur(field);
    expect(field).toHaveValue(40);
    act(() => useUI.setState({ dialog: null }));
    expect(screen.getByRole('button', { name: 'Start a 40-minute Pomodoro' })).toBeInTheDocument();
  });
});
