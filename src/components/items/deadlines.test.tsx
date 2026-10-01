import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { openList, useUI } from '@/store/ui';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    detailsOpen: false,
    duePickerFor: null,
    deadlinePickerFor: null,
  });
  list = createList({ type: 'todo', title: 'Tasks' });
  openList(list);
});

const find = (text: string) =>
  Object.values(useData.getState().tables.items).find((i) => i.text === text) as Item;

async function openPanel(text: string) {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    within(screen.getByRole('listitem', { name: text })).getByRole('button', {
      name: 'Open details',
    }),
  );
  return { user, panel: within(screen.getByRole('complementary', { name: 'Task details' })) };
}

/** The Tomorrow choice in the deadline popover (the sidebar has a Tomorrow button too). */
const tomorrowChoice = async () => {
  const dialog = within(await screen.findByRole('dialog', { name: 'Choose deadline' }));
  return dialog.findByRole('button', { name: 'Tomorrow' });
};

describe('deadline in the details panel', () => {
  // Bug it prevents: the deadline could only be set by quick add, never changed or removed later.
  it('sets a deadline from the chooser and clears it again', async () => {
    createItem(list, { text: 'Report' });
    const { user, panel } = await openPanel('Report');

    await user.click(panel.getByRole('button', { name: 'Add deadline' }));
    await user.click(await tomorrowChoice());
    expect(find('Report').deadline).toBe(addDaysKey(todayKey(), 1));
    expect(panel.getByRole('button', { name: 'Deadline Tomorrow, change' })).toHaveTextContent(
      'Deadline Tomorrow',
    );

    await user.click(panel.getByRole('button', { name: 'Clear deadline' }));
    expect(find('Report').deadline).toBeNull();
    expect(panel.getByRole('button', { name: 'Add deadline' })).toBeInTheDocument();
  });

  // Bug it prevents: the deadline was set on the due date, so the two stopped being independent.
  it('leaves the due date alone', async () => {
    createItem(list, { text: 'Report', dueDate: todayKey() });
    const { user, panel } = await openPanel('Report');
    await user.click(panel.getByRole('button', { name: 'Add deadline' }));
    await user.click(await tomorrowChoice());
    expect(find('Report').dueDate).toBe(todayKey());
  });
});

describe('end time in the due picker', () => {
  // Bug it prevents: an end field for a task with no start, or one accepting an end before the start.
  it('appears once there is a time, and refuses an end before the start', async () => {
    createItem(list, { text: 'Call', dueDate: todayKey() });
    const { user, panel } = await openPanel('Call');
    await user.click(panel.getByRole('button', { name: /^Due / }));
    expect(screen.queryByLabelText('End')).not.toBeInTheDocument();

    await user.type(await screen.findByLabelText('Time'), '14:00');
    const end = await screen.findByLabelText('End');
    expect(end).toHaveValue('');

    // An end before the start isn't saved, but the field keeps it while it's being typed
    // (typing over the hour of 15:30 passes through 01:30) and drops it on leaving.
    fireEvent.change(end, { target: { value: '13:00' } });
    expect(find('Call').endTime).toBeNull();
    expect(end).toHaveValue('13:00');
    fireEvent.blur(end);
    expect(end).toHaveValue('');

    fireEvent.change(end, { target: { value: '15:30' } });
    expect(find('Call').endTime).toBe('15:30');
  });
});
