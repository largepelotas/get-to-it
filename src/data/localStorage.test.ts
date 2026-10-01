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
});
