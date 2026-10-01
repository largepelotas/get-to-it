import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { createItem } from '@/store/actions/items';
import { createList, deleteList } from '@/store/actions/lists';
import { createSection, setSectionCollapsed } from '@/store/actions/sections';
import { resetForTests, useData } from '@/store/data';
import { todoModel } from '@/store/todo';
import { openList, useUI } from '@/store/ui';
import { NO_SECTION_ID, planDrop, sectionKey, type Group } from './dropPlan';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({
    view: { kind: 'today' },
    dialog: null,
    renaming: null,
    renamingSectionId: null,
    selectedItemId: null,
    multiSelectedIds: [],
  });
  list = createList({ type: 'todo', title: 'Tasks' });
  openList(list);
});

const tables = () => useData.getState().tables;
const find = (text: string) => Object.values(tables().items).find((i) => i.text === text)!;
const addTask = (text: string, sectionId: string | null = null) =>
  createItem(list, { text, sectionId })!;
const addSection = (title: string) => createSection(list, title)!;
/** Open tasks by group: `["A", "Kitchen: B, C"]`. */
const layout = () => {
  const m = todoModel(tables().items, list, tables().sections);
  const top = (rows: { item: { text: string }; depth: number }[]) =>
    rows.filter((r) => r.depth === 0).map((r) => r.item.text);
  return [
    ...(m.unsectioned.length ? [top(m.unsectioned).join(', ')] : []),
    ...m.sections.map((s) => `${s.section.title}: ${top(s.rows).join(', ')}`),
  ];
};
const row = (text: string) => screen.getByRole('listitem', { name: text });
const rowText = (text: string) => within(row(text)).getByRole('textbox', { name: 'Task' });
const heading = (title: string, count?: number) =>
  screen.getByRole('heading', {
    name:
      count === undefined
        ? new RegExp(`^${title}, \\d+ tasks?$`)
        : `${title}, ${count} ${count === 1 ? 'task' : 'tasks'}`,
  });
const openMenu = (user: ReturnType<typeof userEvent.setup>, target: HTMLElement) =>
  user.pointer({ keys: '[MouseRight]', target });

describe('TodoList sections', () => {
  it('shows each heading with its open count, after the unsectioned tasks', () => {
    addTask('Loose');
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    addTask('Shelves', kitchen);
    addSection('Garden');
    render(<App />);
    expect(heading('Kitchen', 2)).toHaveAttribute('aria-level', '2');
    expect(heading('Garden', 0)).toBeInTheDocument();
    const order = screen
      .getAllByRole('listitem')
      .map((el) => el.getAttribute('aria-label'))
      .filter(Boolean);
    expect(order).toEqual(['Loose', 'Paint', 'Shelves']);
    expect(
      screen
        .getByRole('list', { name: 'Kitchen tasks' })
        .compareDocumentPosition(heading('Garden', 0)),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // Bug: a list with no sections must look and behave as it did before sections existed.
  it('draws no headings, extra lists or section buttons for a list without sections', () => {
    addTask('A');
    render(<App />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('collapses and expands a section, keeping the state on the section', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    const toggle = within(heading('Kitchen')).getByRole('button', { name: 'Collapse Kitchen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('listitem', { name: 'Paint' })).not.toBeInTheDocument();
    expect(tables().sections[kitchen].collapsed).toBe(true);
    expect(heading('Kitchen', 1)).toBeInTheDocument();
    await user.click(within(heading('Kitchen')).getByRole('button', { name: 'Expand Kitchen' }));
    expect(row('Paint')).toBeInTheDocument();
  });

  // Bug: a blank rename wiped the heading's title.
  it('renames in place: Enter saves, Escape cancels, blank keeps the old title', async () => {
    const kitchen = addSection('Kitchen');
    const user = userEvent.setup();
    render(<App />);
    await user.dblClick(within(heading('Kitchen')).getByText('Kitchen'));
    await user.keyboard('{Control>}a{/Control}Pantry{Enter}');
    expect(tables().sections[kitchen].title).toBe('Pantry');
    expect(heading('Pantry')).toHaveFocus();

    await user.dblClick(within(heading('Pantry')).getByText('Pantry'));
    await user.keyboard('{Control>}a{/Control}Nope{Escape}');
    expect(tables().sections[kitchen].title).toBe('Pantry');

    await user.dblClick(within(heading('Pantry')).getByText('Pantry'));
    await user.keyboard('{Control>}a{/Control}{Backspace}{Enter}');
    expect(tables().sections[kitchen].title).toBe('Pantry');
    expect(screen.queryByRole('textbox', { name: 'Section name' })).not.toBeInTheDocument();
  });

  it('adds a section from the list menu and from the button under the tasks, opening it for naming', async () => {
    addTask('A');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    expect(await screen.findByRole('textbox', { name: 'Section name' })).toHaveFocus();
    await user.keyboard('{Control>}a{/Control}Kitchen{Enter}');
    expect(Object.values(tables().sections).map((s) => s.title)).toEqual(['Kitchen']);

    await user.click(screen.getByRole('button', { name: 'List actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add section' }));
    const field = await screen.findByRole('textbox', { name: 'Section name' });
    expect(field).toHaveValue('Untitled section');
    await user.keyboard('Garden{Enter}');
    expect(Object.values(tables().sections).map((s) => s.title)).toEqual(['Kitchen', 'Garden']);
  });

  it('adds a task at the end of a section from the heading, expanding it, and Enter stays in that section', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    addSection('Garden');
    addTask('Loose');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(heading('Kitchen')).getByRole('button', { name: 'Collapse Kitchen' }));
    await user.click(within(heading('Kitchen')).getByRole('button', { name: 'Add task' }));
    expect(tables().sections[kitchen].collapsed).toBe(false);
    const draft = await screen.findByRole('textbox', { name: 'New task' });
    expect(draft).toHaveFocus();
    await user.keyboard('Tile{Enter}Grout{Enter}');
    expect(layout()).toEqual(['Loose', 'Kitchen: Paint, Tile, Grout', 'Garden: ']);

    // Enter on a task row keeps creating in that row's section.
    await user.keyboard('{Escape}');
    await user.click(rowText('Paint'));
    await user.keyboard('{Enter}Sand{Enter}');
    expect(layout()).toEqual(['Loose', 'Kitchen: Paint, Sand, Tile, Grout', 'Garden: ']);
  });

  it('adds into an empty section', async () => {
    addSection('Kitchen');
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(heading('Kitchen')).getByRole('button', { name: 'Add task' }));
    await user.keyboard('Paint{Enter}');
    expect(layout()).toEqual(['Kitchen: Paint']);
  });

  // Bug: the list's own quick add put tasks in a section.
  it('keeps the list quick add and Shift+A adding to no section', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox', { name: 'Add a task' }), 'Loose{Enter}');
    expect(layout()).toEqual(['Loose', 'Kitchen: Paint']);
    await user.click(rowText('Paint'));
    await user.keyboard('{Escape}{Shift>}a{/Shift}Top{Enter}');
    expect(layout()).toEqual(['Top, Loose', 'Kitchen: Paint']);
  });

  it('deletes a section in one undo step with a toast, keeping its tasks', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    addTask('Loose');
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, heading('Kitchen'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete section' }));
    expect(layout()).toEqual(['Loose, Paint']);
    const toast = (await screen.findByText('Deleted section Kitchen')).closest<HTMLElement>(
      '[data-sonner-toast]',
    )!;
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(layout()).toEqual(['Loose', 'Kitchen: Paint']);
  });

  it('moves a task between sections from its menu, ticking the current one', async () => {
    const kitchen = addSection('Kitchen');
    addSection('Garden');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, row('Paint'));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to section' }));
    await user.keyboard('{ArrowRight}');
    const current = await screen.findByRole('menuitem', { name: 'Kitchen' });
    expect(current).toHaveAttribute('aria-disabled', 'true');
    const garden = await screen.findByRole('menuitem', { name: 'Garden' });
    act(() => garden.focus());
    await user.keyboard('{Enter}');
    expect(layout()).toEqual(['Kitchen: ', 'Garden: Paint']);
  });

  // Bug: the submenu appeared in lists that have no sections to move to.
  it('leaves "Move to section" out when the list has no sections', async () => {
    addTask('A');
    const user = userEvent.setup();
    render(<App />);
    await openMenu(user, row('A'));
    await screen.findByRole('menuitem', { name: 'Duplicate' });
    expect(screen.queryByRole('menuitem', { name: 'Move to section' })).not.toBeInTheDocument();
  });
});

describe('TodoList section keyboard', () => {
  it('steps through headings with the arrow keys and collapses with Left/Right/Space', async () => {
    addTask('Loose');
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('Loose'));
    await user.keyboard('{ArrowDown}');
    expect(heading('Kitchen')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(tables().sections[kitchen].collapsed).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(tables().sections[kitchen].collapsed).toBe(false);
    await user.keyboard(' ');
    expect(tables().sections[kitchen].collapsed).toBe(true);
    await user.keyboard(' {ArrowDown}');
    expect(row('Paint')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(heading('Kitchen')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(row('Loose')).toHaveFocus();
  });

  it('renames with Enter or F2 and reorders with Alt+Up/Down, keeping focus', async () => {
    const kitchen = addSection('Kitchen');
    const garden = addSection('Garden');
    const user = userEvent.setup();
    render(<App />);
    act(() => heading('Garden').focus());
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(layout()).toEqual(['Garden: ', 'Kitchen: ']);
    expect(heading('Garden')).toHaveFocus();
    await user.keyboard('{F2}');
    expect(await screen.findByRole('textbox', { name: 'Section name' })).toBeInTheDocument();
    await user.keyboard('{Control>}a{/Control}Yard{Enter}');
    expect(tables().sections[garden].title).toBe('Yard');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Section name' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(tables().sections[kitchen].title).toBe('Kitchen');
  });

  // Bug: task shortcuts (E, Delete, V, 1-4) on a heading acted on the previously selected task.
  it('ignores task shortcuts on a heading', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('Paint'));
    act(() => heading('Kitchen').focus());
    await user.keyboard('e1{Delete}v');
    expect(find('Paint')).toMatchObject({ checked: false, priority: 0, deletedAt: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Alt+Up/Down moves a task across a section edge and keeps focus on it', async () => {
    addTask('Loose');
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await user.click(row('Loose'));
    await user.keyboard('{Escape}');
    act(() => row('Loose').focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(layout()).toEqual(['Kitchen: Loose, Paint']);
    expect(row('Loose')).toHaveFocus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(layout()).toEqual(['Loose', 'Kitchen: Paint']);
    expect(row('Loose')).toHaveFocus();
  });

  // Bug: moving into a collapsed neighbour made the task vanish and lost keyboard focus.
  it('opens a collapsed section a task is moved into', async () => {
    addTask('Loose');
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(heading('Kitchen')).getByRole('button', { name: 'Collapse Kitchen' }));
    act(() => row('Loose').focus());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(tables().sections[kitchen].collapsed).toBe(false);
    expect(row('Loose')).toHaveFocus();
  });

  it('keeps headings out of Ctrl+A and Shift ranges', async () => {
    addTask('A');
    const kitchen = addSection('Kitchen');
    addTask('B', kitchen);
    const garden = addSection('Garden');
    addTask('C', garden);
    const user = userEvent.setup();
    render(<App />);
    act(() => row('A').focus());
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    // The heading is skipped: the range is A..B.
    expect(row('B')).toHaveFocus();
    expect(useUI.getState().multiSelectedIds).toEqual([find('A').id, find('B').id]);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(useUI.getState().multiSelectedIds).toEqual([find('A').id, find('B').id, find('C').id]);
    await user.keyboard('{Escape}');
    act(() => row('A').focus());
    await user.keyboard('{Control>}a{/Control}');
    expect(useUI.getState().multiSelectedIds).toHaveLength(3);
    await user.keyboard('{Shift>}');
    await user.click(row('C'));
    await user.keyboard('{/Shift}');
    expect(useUI.getState().multiSelectedIds.every((id) => tables().items[id])).toBe(true);
  });
});

describe('TodoList section read-only', () => {
  // Bug: headings in an archived or trashed list offered rename, add and delete.
  it('shows headings in a trashed list with collapse only', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    deleteList(list);
    const user = userEvent.setup();
    render(<App />);
    const head = heading('Kitchen', 1);
    expect(within(head).queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
    expect(within(head).queryByRole('button', { name: 'Section actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add section' })).not.toBeInTheDocument();
    await user.dblClick(within(head).getByText('Kitchen'));
    expect(screen.queryByRole('textbox', { name: 'Section name' })).not.toBeInTheDocument();
    act(() => head.focus());
    await user.keyboard('{F2}');
    expect(screen.queryByRole('textbox', { name: 'Section name' })).not.toBeInTheDocument();
    await user.click(within(head).getByRole('button', { name: 'Collapse Kitchen' }));
    expect(screen.queryByRole('listitem', { name: 'Paint' })).not.toBeInTheDocument();
  });
});

describe('planDrop', () => {
  /** Groups the way the screen builds them, from a list's data. */
  const groups = (): Group[] => {
    const m = todoModel(tables().items, list, tables().sections);
    return [
      { id: null, section: null, rows: m.unsectioned, shown: m.unsectioned, count: 0 },
      ...m.sections.map((s) => ({
        id: s.section.id,
        section: s.section,
        rows: s.rows,
        shown: s.section.collapsed ? [] : s.rows,
        count: s.openCount,
      })),
    ];
  };

  it('lands on the start of an open section, or the end of a collapsed one', () => {
    const kitchen = addSection('Kitchen');
    addTask('P', kitchen);
    addTask('Q', kitchen);
    const a = addTask('A');
    expect(planDrop(groups(), a, sectionKey(kitchen), 0)).toEqual({
      parentId: null,
      afterId: null,
      sectionId: kitchen,
      depth: 0,
    });
    setSectionCollapsed(kitchen, true);
    expect(planDrop(groups(), a, sectionKey(kitchen), 0)).toMatchObject({
      afterId: find('Q').id,
      sectionId: kitchen,
    });
  });

  it('drops after a task in another group, and clears the section for the unsectioned group', () => {
    const kitchen = addSection('Kitchen');
    const p = addTask('P', kitchen);
    addTask('Q', kitchen);
    const a = addTask('A');
    expect(planDrop(groups(), a, p, 0)).toEqual({
      parentId: null,
      afterId: p,
      sectionId: kitchen,
      depth: 0,
    });
    expect(planDrop(groups(), p, a, 0)).toMatchObject({ sectionId: null, afterId: a });
  });

  // Bug prevented: a task could not be dragged out of a section to "no section" when nothing was unsectioned.
  it('drops on the no-section zone at the start of the unsectioned group, even when empty', () => {
    const kitchen = addSection('Kitchen');
    const p = addTask('P', kitchen);
    expect(planDrop(groups(), p, NO_SECTION_ID, 0)).toEqual({
      parentId: null,
      afterId: null,
      sectionId: null,
      depth: 0,
    });
  });

  // Bug prevented: the zone landing after the existing unsectioned tasks instead of first.
  it('puts a task dropped on the zone before existing unsectioned tasks', () => {
    const kitchen = addSection('Kitchen');
    addTask('U1');
    const p = addTask('P', kitchen);
    expect(planDrop(groups(), p, NO_SECTION_ID, 0)).toMatchObject({
      parentId: null,
      afterId: null,
      sectionId: null,
    });
  });

  // Bug prevented: a subtask dropped on the zone staying a subtask.
  it('makes a subtask dropped on the zone a top-level unsectioned task', () => {
    const kitchen = addSection('Kitchen');
    const p = addTask('P', kitchen);
    const sub = createItem(list, { text: 'Sub', parentId: p })!;
    expect(planDrop(groups(), sub, NO_SECTION_ID, 40)).toEqual({
      parentId: null,
      afterId: null,
      sectionId: null,
      depth: 0,
    });
  });

  it('still indents inside a section by dragging right', () => {
    const kitchen = addSection('Kitchen');
    const p = addTask('P', kitchen);
    const q = addTask('Q', kitchen);
    const r = addTask('R', kitchen);
    expect(planDrop(groups(), r, q, 24)).toMatchObject({ parentId: p, depth: 1 });
  });

  it("returns nothing for a drop onto the dragged task's own subtasks", () => {
    const a = addTask('A');
    createItem(list, { text: 'A1', parentId: a });
    expect(planDrop(groups(), a, find('A1').id, 0)).toBeNull();
  });
});

describe('no-section drop zone', () => {
  // Bug prevented: the zone showing when nothing is being dragged, or in a list with no sections.
  it('is absent with no drag, with or without sections', () => {
    addTask('A');
    const { unmount } = render(<App />);
    expect(screen.queryByTestId('no-section-zone')).toBeNull();
    unmount();
    const kitchen = addSection('Kitchen');
    addTask('P', kitchen);
    render(<App />);
    expect(screen.queryByTestId('no-section-zone')).toBeNull();
  });
});

describe('quick add with /section', () => {
  const field = () => screen.getByRole('textbox', { name: 'Add a task' });

  it('files a task in the typed section of the open list and previews the chip', async () => {
    const kitchen = addSection('Kitchen');
    addTask('Paint', kitchen);
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Buy tiles /kitchen');
    expect(screen.getByText('/Kitchen')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(layout()).toEqual(['Kitchen: Paint, Buy tiles']);
  });

  it('leaves a /word that is not a section as typed', async () => {
    addSection('Kitchen');
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Ask and/or call{Enter}');
    expect(find('Ask and/or call')).toMatchObject({ sectionId: null });
  });

  it('works in a smart view together with #List', async () => {
    const other = createList({ type: 'todo', title: 'Home' });
    const sectionId = createSection(other, 'Kitchen')!;
    useUI.setState({ view: { kind: 'today' } });
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Buy paint #Home /Kitchen{Enter}');
    expect(find('Buy paint')).toMatchObject({ listId: other, sectionId });
  });

  // Bug: a /Section from another list filed the task in a section of the wrong list.
  it('ignores a section that belongs to a different list', async () => {
    const other = createList({ type: 'todo', title: 'Home' });
    createSection(other, 'Kitchen');
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.type(field(), 'Buy paint /Kitchen{Enter}');
    expect(find('Buy paint /Kitchen')).toMatchObject({ listId: list, sectionId: null });
  });

  it('works in the quick-add dialog for the picked list', async () => {
    const other = createList({ type: 'todo', title: 'Home' });
    const sectionId = createSection(other, 'Kitchen')!;
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.keyboard('{Control>}{Shift>}a{/Shift}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Add a task' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'List' }), other);
    await user.type(within(dialog).getByRole('textbox', { name: 'Add a task' }), 'Tiles /Kitchen');
    expect(within(dialog).getByText('/Kitchen')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(find('Tiles')).toMatchObject({ listId: other, sectionId });
  });

  it('parses every pasted line on its own', async () => {
    const kitchen = addSection('Kitchen');
    const garden = addSection('Garden');
    const user = userEvent.setup({ delay: null });
    render(<App />);
    await user.click(field());
    await user.paste('Tiles /Kitchen\nSpade /Garden\nPlain');
    await user.click(screen.getByRole('button', { name: 'Add 3 tasks' }));
    expect(find('Tiles').sectionId).toBe(kitchen);
    expect(find('Spade').sectionId).toBe(garden);
    expect(find('Plain').sectionId).toBeNull();
  });
});
