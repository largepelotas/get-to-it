import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { resetForTests, undo, useData } from '../data';
import {
  createFilter,
  deleteFilter,
  moveFilterBy,
  renameFilter,
  setFilterColor,
  updateFilter,
} from './filters';

beforeEach(() => {
  resetForTests(new MemoryRepository());
});

const filters = () => useData.getState().tables.filters;
const names = () =>
  Object.values(filters())
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    .map((f) => f.name);
const steps = () => useData.getState().past.length;

describe('createFilter', () => {
  // Bug prevented: a filter saved with a blank name or query, which could never be opened sensibly.
  it('adds a filter at the end with a tidied name, and refuses blanks', () => {
    const a = createFilter({ name: '  Work   week ', query: ' #Work & 7 days ' })!;
    const b = createFilter({ name: 'Urgent', query: 'p1', color: 'red' })!;
    expect(filters()[a]).toMatchObject({ name: 'Work week', query: '#Work & 7 days', color: null });
    expect(filters()[b]).toMatchObject({ name: 'Urgent', query: 'p1', color: 'red' });
    expect(names()).toEqual(['Work week', 'Urgent']);
    expect(createFilter({ name: '   ', query: 'p1' })).toBeNull();
    expect(createFilter({ name: 'No query', query: '  ' })).toBeNull();
    expect(Object.keys(filters())).toHaveLength(2);
  });

  it('is one undo step', () => {
    const before = steps();
    createFilter({ name: 'A', query: 'p1' });
    expect(steps()).toBe(before + 1);
    undo();
    expect(filters()).toEqual({});
  });
});

describe('updateFilter and renameFilter', () => {
  it('changes the name and query together, or the name alone, refusing blanks', () => {
    const id = createFilter({ name: 'A', query: 'p1' })!;
    expect(updateFilter(id, { name: 'B', query: 'p2 & today' })).toBe(true);
    expect(filters()[id]).toMatchObject({ name: 'B', query: 'p2 & today' });
    expect(updateFilter(id, { name: '', query: 'p3' })).toBe(false);
    expect(updateFilter(id, { name: 'C', query: ' ' })).toBe(false);
    expect(filters()[id]).toMatchObject({ name: 'B', query: 'p2 & today' });
    expect(renameFilter(id, '  Later ')).toBe(true);
    expect(filters()[id].name).toBe('Later');
    expect(renameFilter(id, '')).toBe(false);
    expect(renameFilter('missing', 'X')).toBe(false);
  });

  // Bug prevented: saving a filter unchanged adding an empty undo step.
  it('saving the same values is not an undo step', () => {
    const id = createFilter({ name: 'A', query: 'p1' })!;
    const before = steps();
    updateFilter(id, { name: 'A', query: 'p1' });
    expect(steps()).toBe(before);
  });
});

describe('setFilterColor and moveFilterBy', () => {
  it('colours a filter and moves it up or down, stopping at the ends', () => {
    const a = createFilter({ name: 'A', query: 'p1' })!;
    createFilter({ name: 'B', query: 'p2' });
    const c = createFilter({ name: 'C', query: 'p3' })!;
    setFilterColor(a, 'teal');
    expect(filters()[a].color).toBe('teal');
    expect(moveFilterBy(a, -1)).toBe(false);
    expect(moveFilterBy(c, 1)).toBe(false);
    expect(moveFilterBy(c, -1)).toBe(true);
    expect(names()).toEqual(['A', 'C', 'B']);
    expect(moveFilterBy(a, 1)).toBe(true);
    expect(names()).toEqual(['C', 'A', 'B']);
  });
});

describe('deleteFilter', () => {
  it('removes the filter, and Undo brings it back', () => {
    const id = createFilter({ name: 'A', query: 'p1' })!;
    deleteFilter(id);
    expect(filters()).toEqual({});
    undo();
    expect(filters()[id]).toMatchObject({ name: 'A' });
    const before = steps();
    deleteFilter('missing');
    expect(steps()).toBe(before);
  });
});
