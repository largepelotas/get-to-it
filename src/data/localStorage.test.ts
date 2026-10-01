import { describe, expect, it } from 'vitest';
import { LocalStorageRepository } from './localStorage';

describe('LocalStorageRepository', () => {
  // Bug prevented: data saved before constant reminders existed loading with the field missing.
  it('reads reminders saved without the constant field as ordinary', async () => {
    window.localStorage.setItem(
      'checklist:data:v1',
      JSON.stringify({
        tables: {
          reminders: {
            R1: {
              id: 'R1',
              itemId: 'I1',
              kind: 'relative',
              offsetMinutes: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        },
        settings: {},
      }),
    );
    const { tables } = await new LocalStorageRepository().load();
    expect(tables.reminders.R1.constant).toBe(false);
    window.localStorage.removeItem('checklist:data:v1');
  });

  // Bug prevented: data saved before sections existed failing to load, or loading tasks with
  // sectionId undefined (which later code reads as a real section).
  it('reads data saved before sections as having none, with tasks unsectioned', async () => {
    window.localStorage.setItem(
      'checklist:data:v1',
      JSON.stringify({
        tables: {
          items: { I1: { id: 'I1', listId: 'L1', parentId: null, text: 'Old' } },
        },
        settings: {},
      }),
    );
    const { tables } = await new LocalStorageRepository().load();
    expect(tables.sections).toEqual({});
    expect(tables.items.I1.sectionId).toBeNull();
    window.localStorage.removeItem('checklist:data:v1');
  });
});

describe('LocalStorageRepository labels', () => {
  // Bug prevented: data saved before labels existed loading with labelIds undefined.
  it('reads data saved before labels as having none, with tasks unlabelled', async () => {
    window.localStorage.setItem(
      'checklist:data:v1',
      JSON.stringify({
        tables: {
          items: { I1: { id: 'I1', listId: 'L1', parentId: null, text: 'Old' } },
        },
        settings: {},
      }),
    );
    const { tables } = await new LocalStorageRepository().load();
    expect(tables.labels).toEqual({});
    expect(tables.items.I1.labelIds).toEqual([]);
    window.localStorage.removeItem('checklist:data:v1');
  });
});
