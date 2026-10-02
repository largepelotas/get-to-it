import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { revealItem } from '@/commands';
import { MemoryRepository } from '@/data/memory';
import { todayKey } from '@/lib/dates';
import { createItem, setChecked, setItemCollapsed } from '@/store/actions/items';
import { createList } from '@/store/actions/lists';
import { createSection, setSectionCollapsed } from '@/store/actions/sections';
import { resetForTests, setSetting, useData } from '@/store/data';
import { useUI } from '@/store/ui';

let list: string;
const row = (text: string) => screen.getByRole('listitem', { name: text });
const optionsKey = () => `list:${list}`;
const savedOptions = () => useData.getState().settings.viewOptions[optionsKey()];

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
  list = createList({ type: 'todo', title: 'Work' });
});

// Bug prevented: a task opened from search (or the focus bar, or Completed) landing on its
// list with no row to focus, because something still hid it.
describe('revealItem', () => {
  it('expands the collapsed section the task is in', () => {
    const later = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'Hidden away', sectionId: later })!;
    setSectionCollapsed(later, true);
    render(<App />);
    act(() => revealItem(id));
    expect(useData.getState().tables.sections[later].collapsed).toBe(false);
    expect(row('Hidden away')).toHaveFocus();
    expect(useUI.getState()).toMatchObject({ selectedItemId: id, detailsOpen: true, reveal: null });
  });

  it('expands the section of a subtask’s top-level task, and its collapsed parent', () => {
    const later = createSection(list, 'Later')!;
    const parent = createItem(list, { text: 'Parent', sectionId: later })!;
    const child = createItem(list, { text: 'Child', parentId: parent })!;
    setItemCollapsed(parent, true);
    setSectionCollapsed(later, true);
    render(<App />);
    act(() => revealItem(child));
    expect(row('Child')).toHaveFocus();
  });

  it('leaves other collapsed sections alone, and is not an undo step', () => {
    const later = createSection(list, 'Later')!;
    const someday = createSection(list, 'Someday')!;
    const id = createItem(list, { text: 'Hidden away', sectionId: later })!;
    setSectionCollapsed(later, true);
    setSectionCollapsed(someday, true);
    const steps = useData.getState().past.length;
    revealItem(id);
    expect(useData.getState().tables.sections[someday].collapsed).toBe(true);
    expect(useData.getState().past).toHaveLength(steps);
  });

  it('puts a sorted list back in list order to show a completed task', () => {
    const id = createItem(list, { text: 'All done' })!;
    createItem(list, { text: 'Still open' });
    setChecked(id, true);
    setSetting('viewOptions', {
      [optionsKey()]: { sort: 'name', group: 'default', layout: 'list' },
    });
    render(<App />);
    act(() => revealItem(id));
    expect(savedOptions()).toBeUndefined();
    expect(useData.getState().tables.lists[list].showCompleted).toBe(true);
    expect(row('All done')).toHaveFocus();
    expect(useUI.getState().reveal).toBeNull();
  });

  it('keeps the arrangement for an open task, which it shows', () => {
    const later = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'Open task', sectionId: later })!;
    setSectionCollapsed(later, true);
    const options = { sort: 'name', group: 'priority', layout: 'list' } as const;
    setSetting('viewOptions', { [optionsKey()]: options });
    render(<App />);
    act(() => revealItem(id));
    expect(savedOptions()).toEqual(options);
    expect(row('Open task')).toHaveFocus();
  });
});

// Bug prevented: "Go to list" opening the list with the task neither focused nor in view.
describe('Go to list from a smart view', () => {
  it('focuses the task in its list, expanding what hides it, without opening details', async () => {
    const later = createSection(list, 'Later')!;
    const id = createItem(list, { text: 'Due today', dueDate: todayKey(), sectionId: later })!;
    setSectionCollapsed(later, true);
    const user = userEvent.setup();
    render(<App />);
    await user.pointer({ keys: '[MouseRight]', target: row('Due today') });
    await user.click(screen.getByRole('menuitem', { name: 'Go to list' }));
    expect(useUI.getState().view).toEqual({ kind: 'list', listId: list });
    expect(row('Due today')).toHaveFocus();
    expect(useUI.getState()).toMatchObject({ selectedItemId: id, detailsOpen: false });
  });
});
