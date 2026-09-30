import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { docFromText, parseDoc } from '@/lib/richText';
import { createItem } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { resetForTests, useData } from '@/store/data';
import { todoModel } from '@/store/todo';
import { openList, useUI } from '@/store/ui';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({ view: { kind: 'today' }, dialog: null, renaming: null, selectedItemId: null });
  list = createList({ type: 'todo', title: 'Tasks' });
  openList(list);
});

const add = (text: string, parentId?: string) => createItem(list, { text, parentId })!;
/** The open section as `text@depth`. */
const open = () =>
  todoModel(useData.getState().tables.items, list).open.map((r) => `${r.item.text}@${r.depth}`);
const row = (text: string) => screen.getByRole('listitem', { name: text });
const rowText = (text: string) => within(row(text)).getByRole('textbox', { name: 'Task' });

describe('TodoList', () => {
  it('adds tasks from the quick-add field and previews what it read', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByRole('textbox', { name: 'Add a task' });
    await user.type(field, 'Pay invoice p1');
    expect(screen.getByText('P1')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await user.type(field, 'Call Sam{Enter}');
    expect(field).toHaveValue('');
    expect(open()).toEqual(['Pay invoice@0', 'Call Sam@0']);
    expect(within(row('Pay invoice')).getByLabelText('Priority 1')).toBeInTheDocument();
  });

  it('adds below with Enter and nests the new task with Tab', async () => {
    add('Write report');
    add('Book flights');
    const user = userEvent.setup();
    render(<App />);
    await user.click(rowText('Write report'));
    await user.keyboard('{Enter}');
    const draft = screen.getByRole('textbox', { name: 'New task' });
    expect(draft).toHaveFocus();
    await user.keyboard('{Tab}Outline{Enter}Draft{Enter}');
    expect(open()).toEqual(['Write report@0', 'Outline@1', 'Draft@1', 'Book flights@0']);
    // Backspace in the empty field goes back to the task above.
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('textbox', { name: 'New task' })).not.toBeInTheDocument();
    expect(rowText('Draft')).toHaveFocus();
  });

  it('indents, outdents and moves with the keyboard', async () => {
    add('A');
    add('B');
    add('C');
    const user = userEvent.setup();
    render(<App />);
    await user.click(rowText('B'));
    await user.keyboard('{Tab}');
    expect(open()).toEqual(['A@0', 'B@1', 'C@0']);
    expect(rowText('B')).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(open()).toEqual(['A@0', 'B@0', 'C@0']);
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(open()).toEqual(['B@0', 'A@0', 'C@0']);
  });

  it('toggles with Space, hides the Completed section, and deletes with Undo', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.click(rowText('A'));
    await user.keyboard('{Escape}');
    expect(row('A')).toHaveFocus();
    await user.keyboard(' ');
    expect(open()).toEqual(['B@0']);
    expect(row('B')).toHaveFocus();
    const completed = within(screen.getByRole('list', { name: 'Completed tasks' }));
    expect(completed.getByRole('checkbox', { name: 'A' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.queryByRole('list', { name: 'Completed tasks' })).not.toBeInTheDocument();

    // Clicking the row outside its text selects it for keyboard actions.
    await user.click(row('B'));
    expect(row('B')).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(open()).toEqual([]);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(open()).toEqual(['B@0']);
  });

  it('removes a task when its text is cleared and Backspace is pressed', async () => {
    add('A');
    add('B');
    const user = userEvent.setup();
    render(<App />);
    await user.clear(rowText('B'));
    // Blank text isn't saved, so the task keeps its old name until it's removed.
    expect(open()).toEqual(['A@0', 'B@0']);
    await user.keyboard('{Backspace}');
    expect(open()).toEqual(['A@0']);
    expect(rowText('A')).toHaveFocus();
  });

  it('checks a parent together with its subtasks', async () => {
    const a = add('A');
    add('A1', a);
    const user = userEvent.setup();
    render(<App />);
    expect(within(row('A')).getByText('0/1')).toBeInTheDocument();
    await user.click(within(row('A')).getByRole('checkbox', { name: 'A' }));
    const completed = within(screen.getByRole('list', { name: 'Completed tasks' }));
    expect(completed.getByRole('checkbox', { name: 'A1' })).toBeChecked();
  });

  it('edits a task in the details panel', async () => {
    add('Report');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(row('Report')).getByRole('button', { name: 'Open details' }));
    const panel = within(screen.getByRole('complementary', { name: 'Task details' }));

    await user.type(await panel.findByRole('textbox', { name: 'Notes' }), 'Numbers from finance');
    await user.click(panel.getByRole('button', { name: 'Priority 2' }));
    await user.type(panel.getByRole('textbox', { name: 'Add subtask' }), 'Charts{Enter}');

    const report = Object.values(useData.getState().tables.items).find((i) => i.text === 'Report')!;
    expect(report.priority).toBe(2);
    expect(parseDoc(report.details)).toEqual(docFromText('Numbers from finance'));
    expect(open()).toEqual(['Report@0', 'Charts@1']);
    expect(panel.getByRole('button', { name: 'Charts' })).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Charts' }));
    expect(panel.getByRole('textbox', { name: 'Task title' })).toHaveValue('Charts');
    await user.click(panel.getByRole('button', { name: 'Report' }));
    expect(panel.getByRole('textbox', { name: 'Task title' })).toHaveValue('Report');

    await user.click(panel.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary', { name: 'Task details' })).not.toBeInTheDocument();
  });

  it('is read-only in an archived list', () => {
    add('A');
    act(() =>
      useData.setState((s) => ({
        tables: {
          ...s.tables,
          lists: { ...s.tables.lists, [list]: { ...s.tables.lists[list], archivedAt: 1 } },
        },
      })),
    );
    render(<App />);
    expect(screen.queryByRole('textbox', { name: 'Add a task' })).not.toBeInTheDocument();
    expect(rowText('A')).toHaveAttribute('readonly');
    expect(within(row('A')).getByRole('checkbox')).toBeDisabled();
  });
});
