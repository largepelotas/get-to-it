import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import type { Item } from '@/data/types';
import { addDaysKey, todayKey } from '@/lib/dates';
import { createItem } from '@/store/actions/items';
import { createLabel, setItemLabels } from '@/store/actions/labels';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { navigate, useUI } from '@/store/ui';

let work: string;
const today = todayKey();
const item = (id: string): Item => useData.getState().tables.items[id];
const row = (text: string) => screen.getByRole('listitem', { name: text });
const queryRow = (text: string) => screen.queryByRole('listitem', { name: text });

beforeEach(() => {
  toast.dismiss();
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    selectedItemId: null,
    multiSelectedIds: [],
    detailsOpen: false,
    reveal: null,
  });
  work = createList({ type: 'todo', title: 'Work' });
});

// Bug prevented: every check moving focus and the selection to the next row, even when the
// checkbox was clicked or the task stayed where it was.
describe('checking a task in a smart view', () => {
  it('moves focus to the neighbour when a task checked from the keyboard leaves', async () => {
    createItem(work, { text: 'First', dueDate: today });
    const second = createItem(work, { text: 'Second', dueDate: today })!;
    const user = userEvent.setup();
    render(<App />);
    row('First').focus();
    await user.keyboard(' ');
    expect(queryRow('First')).not.toBeInTheDocument();
    expect(row('Second')).toHaveFocus();
    expect(useUI.getState().selectedItemId).toBe(second);
  });

  it('leaves focus and the selection alone when the checkbox is clicked', async () => {
    createItem(work, { text: 'First', dueDate: today });
    const second = createItem(work, { text: 'Second', dueDate: today })!;
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('First')).getByRole('checkbox'));
    expect(queryRow('First')).not.toBeInTheDocument();
    expect(row('Second')).not.toHaveFocus();
    expect(useUI.getState().selectedItemId).not.toBe(second);
  });

  it('keeps focus on a repeating task that stays in the view', async () => {
    const daily = createItem(work, {
      text: 'Water plants',
      dueDate: today,
      recurrence: { freq: 'daily', interval: 1, mode: 'schedule' },
    })!;
    createItem(work, { text: 'Other', dueDate: today });
    navigate({ kind: 'next7' });
    const user = userEvent.setup();
    render(<App />);
    row('Water plants').focus();
    await user.keyboard(' ');
    expect(item(daily)).toMatchObject({ checked: false, dueDate: addDaysKey(today, 1) });
    expect(row('Water plants')).toHaveFocus();
    expect(useUI.getState().selectedItemId).toBe(daily);
  });
});

// Bug prevented: the priority keys doing nothing on AZERTY, where the digit keys print & é " '.
describe('priority keys by position', () => {
  it('sets the priority of the digit key pressed, whatever it prints', () => {
    const id = createItem(work, { text: 'Task', dueDate: today })!;
    render(<App />);
    row('Task').focus();
    fireEvent.keyDown(row('Task'), { key: 'é', code: 'Digit2' });
    expect(item(id).priority).toBe(2);
    fireEvent.keyDown(row('Task'), { key: "'", code: 'Digit4' });
    expect(item(id).priority).toBe(0);
    // Typed in the text field it is just text.
    fireEvent.keyDown(within(row('Task')).getByRole('textbox'), { key: '&', code: 'Digit1' });
    expect(item(id).priority).toBe(0);
  });
});

// Bug prevented: in a narrow row the details on the right refusing to shrink, squeezing the
// text to nothing and being drawn over it. jsdom does no layout, so this checks the rules
// that decide who gives way.
describe('a row too narrow for everything', () => {
  it('lets the details shrink and keeps a floor under a long title', () => {
    const label = createLabel('deep work')!;
    const long = createItem(work, {
      text: 'Write the quarterly report',
      dueDate: today,
      dueTime: '14:00',
    })!;
    setItemLabels(long, [label]);
    createItem(work, { text: 'Call', dueDate: today });
    render(<App />);

    const longRow = row('Write the quarterly report');
    const title = longRow.querySelector('[data-row-title]')!;
    expect(title).toHaveClass('min-w-[9ch]');
    expect(title).not.toHaveClass('min-w-0');

    const meta = longRow.querySelector('[data-row-meta]')!;
    expect(meta).toHaveClass('min-w-0', 'overflow-hidden');
    expect(meta).not.toHaveClass('shrink-0');
    // The label chips give way before the list name; the date never shrinks.
    const chips = within(longRow).getByRole('button', { name: 'Label deep work, open' });
    expect(chips.parentElement).toHaveClass('shrink-[100]', 'min-w-0');
    expect(within(longRow).getByText('Work').parentElement).toHaveClass('min-w-0');
    expect(within(longRow).getByRole('button', { name: /^Due date/ })).toHaveClass('shrink-0');

    // A short title is never cut.
    expect(row('Call').querySelector('[data-row-title]')).toHaveClass('shrink-0');
  });
});

// Bug prevented: the heading reading "Urgent and importantDo these first."
describe('Eisenhower matrix headings', () => {
  it('puts a space between the title and its hint', () => {
    createItem(work, { text: 'Urgent thing', dueDate: today, priority: 1 });
    navigate({ kind: 'matrix' });
    render(<App />);
    const heading = screen.getByRole('heading', { name: /^Urgent and important/ });
    expect(heading).toHaveTextContent('Urgent and important Do these first.');
    const title = within(heading).getByText('Urgent and important');
    expect(title.parentElement).toHaveClass('flex', 'gap-2');
  });
});
