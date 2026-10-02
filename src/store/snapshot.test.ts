import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '@/data/memory';
import { DEFAULT_SETTINGS } from '@/data/types';
import { backupDue, backupName, backUp, backUpIfDue } from './backup';
import { createItem, setItemNotes } from './actions/items';
import { addReminder } from './actions/reminders';
import { createList, deleteList } from './actions/lists';
import { createFilter } from './actions/filters';
import { createLabel } from './actions/labels';
import { createSection, setSectionCollapsed } from './actions/sections';
import { commit, replaceData, resetForTests, setSetting, useData } from './data';
import {
  describeContents,
  ImportError,
  makeSnapshot,
  parseSnapshot,
  snapshotToJson,
} from './snapshot';

let repo: MemoryRepository;

beforeEach(() => {
  repo = new MemoryRepository();
  resetForTests(repo);
});

const exportNow = () => {
  const { tables, settings } = useData.getState();
  return snapshotToJson(makeSnapshot(tables, settings, 1000));
};

function sampleData() {
  const list = createList({ type: 'todo', title: 'Work' });
  const item = createItem(list, {
    text: 'Call Sam',
    dueDate: '2026-10-02',
    dueTime: '09:30',
    priority: 2,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3], mode: 'schedule' },
  })!;
  setItemNotes(item, 'Bring the numbers');
  addReminder(item, { kind: 'relative', offsetMinutes: 15 });
  createList({ type: 'note', title: 'Ideas' });
  setSetting('weekStartsOn', 0);
  setSetting('palette', 'dusk');
  setSetting('lastBackupAt', 5);
  return { list, item };
}

describe('snapshots', () => {
  it('round-trips everything, without settings that belong to this computer', () => {
    sampleData();
    const { tables } = useData.getState();
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables).toEqual(tables);
    expect(parsed.exportedAt).toBe(1000);
    expect(parsed.settings.weekStartsOn).toBe(0);
    expect(parsed.settings.palette).toBe('dusk');
    expect('lastBackupAt' in parsed.settings).toBe(false);
  });

  it('turns away files that aren’t Checklist exports, with a reason', () => {
    const reason = (json: string) => {
      try {
        parseSnapshot(json);
        return null;
      } catch (err) {
        expect(err).toBeInstanceOf(ImportError);
        return (err as Error).message;
      }
    };
    expect(reason('not json')).toBe('The file isn’t valid JSON.');
    expect(reason('{"app":"other"}')).toBe('The file isn’t a Checklist export.');
    expect(reason('{"app":"checklist","version":2,"tables":{}}')).toBe(
      'The file comes from a newer version of Checklist.',
    );
    expect(reason('{"app":"checklist","version":1}')).toBe('The file has no data in it.');
  });

  it('points at the row and field that is wrong', () => {
    sampleData();
    const data = JSON.parse(exportNow());
    data.tables.items[0].dueDate = '2026-13-45';
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow(
      'In item 1, dueDate should be a date (YYYY-MM-DD).',
    );
    data.tables.items[0].dueDate = null;
    data.tables.lists[0].type = 'kanban';
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow(
      'In list 1, type should be one of todo, grocery, note.',
    );
  });

  it('fills in missing optional fields and drops unknown settings', () => {
    const json = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {
        lists: [{ id: 'L', type: 'todo', title: 'T', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
        items: [
          {
            id: 'I',
            listId: 'L',
            text: 'x',
            sortKey: 'a0',
            dueTime: '10:00',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      settings: {
        theme: 'neon',
        palette: 'neon',
        weekStartsOn: 0,
        bogus: true,
        defaultListId: 'missing',
      },
    });
    const { tables, settings } = parseSnapshot(json);
    expect(tables.lists.L).toMatchObject({ pinned: false, showCompleted: true, folderId: null });
    expect(tables.items.I).toMatchObject({
      checked: false,
      // Exports from before "won't do" load as ordinary tasks.
      wontDo: false,
      priority: 0,
      recurrence: null,
      dueDate: null,
      // A time without a date is dropped.
      dueTime: null,
    });
    expect(settings).toEqual({ weekStartsOn: 0, defaultListId: null });
  });

  // Bug prevented: an import carrying an unknown calendar layout, or losing the chosen one.
  it('round-trips the calendar layout and drops a bad one', () => {
    sampleData();
    setSetting('calendarLayout', 'days');
    expect(parseSnapshot(exportNow()).settings.calendarLayout).toBe('days');
    const data = JSON.parse(exportNow());
    data.settings.calendarLayout = 'year';
    const json = JSON.stringify(data);
    expect('calendarLayout' in parseSnapshot(json).settings).toBe(false);
  });

  // Bug prevented: importing an older export failing, or losing the new settings.
  it('reads a reminder without the constant field as ordinary, and keeps constant ones', () => {
    const base = { itemId: 'I', kind: 'relative', offsetMinutes: 0, createdAt: 1, updatedAt: 1 };
    const { tables } = parseSnapshot(
      JSON.stringify({
        app: 'checklist',
        version: 1,
        tables: {
          reminders: [
            { id: 'A', ...base },
            { id: 'B', ...base, constant: true },
          ],
        },
      }),
    );
    expect(tables.reminders.A.constant).toBe(false);
    expect(tables.reminders.B.constant).toBe(true);
  });

  it('exports and imports the sidebar and daily review settings, dropping unknown view names', () => {
    setSetting('hiddenViews', ['tomorrow', 'next7']);
    setSetting('dailyReviewTime', '08:15');
    expect(parseSnapshot(exportNow()).settings).toMatchObject({
      hiddenViews: ['tomorrow', 'next7'],
      dailyReviewTime: '08:15',
    });
    const odd = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {},
      settings: { hiddenViews: ['today', 'nope'], dailyReviewTime: 'noon' },
    });
    expect(parseSnapshot(odd).settings).toEqual({ hiddenViews: ['today'] });
  });

  it('describes what a data set holds, leaving out the Trash', () => {
    const { list } = sampleData();
    const gone = createList({ type: 'todo', title: 'Gone' });
    createItem(gone, { text: 'x' });
    deleteList(gone);
    expect(describeContents(useData.getState().tables)).toBe('2 lists and 1 item');
    expect(list).toBeTruthy();
  });
});

describe('replaceData', () => {
  it('replaces storage and memory, keeps local settings and clears undo', async () => {
    sampleData();
    const exported = parseSnapshot(exportNow());
    resetForTests(repo);
    createList({ type: 'todo', title: 'Other' });
    setSetting('lastBackupAt', 99);
    expect(useData.getState().past.length).toBe(1);

    await replaceData(exported, ['lastBackupAt']);
    const state = useData.getState();
    expect(state.tables).toEqual(exported.tables);
    expect(state.settings.weekStartsOn).toBe(0);
    expect(state.settings.lastBackupAt).toBe(99);
    expect(state.past).toEqual([]);
    const stored = await repo.load();
    expect(stored.tables).toEqual(exported.tables);
    expect(stored.settings.lastBackupAt).toBe(99);
  });
});

describe('backups', () => {
  it('names backups so they sort by age', () => {
    const name = backupName(new Date(2026, 8, 30, 22, 15, 7));
    expect(name).toBe('checklist-2026-09-30-221507.json');
    expect(backupName(new Date(2026, 8, 30, 22, 15, 7), 'before-import')).toBe(
      'checklist-2026-09-30-221507-before-import.json',
    );
  });

  it('is due once per calendar day', () => {
    const now = new Date(2026, 8, 30, 8, 0);
    expect(backupDue(null, now)).toBe(true);
    expect(backupDue(new Date(2026, 8, 30, 0, 5).getTime(), now)).toBe(false);
    expect(backupDue(new Date(2026, 8, 29, 23, 55).getTime(), now)).toBe(true);
    // A clock that went backwards shouldn't stop backups.
    expect(backupDue(new Date(2026, 9, 5).getTime(), now)).toBe(true);
  });

  it('writes a full export and records the time, only when due and enabled', async () => {
    sampleData();
    setSetting('lastBackupAt', null);
    const write = vi.fn(async () => {});
    const now = new Date(2026, 8, 30, 9, 0);
    expect(await backUpIfDue(write, now)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [name, contents, keep] = write.mock.calls[0] as unknown as [string, string, number];
    expect(name).toBe('checklist-2026-09-30-090000.json');
    expect(keep).toBe(14);
    expect(parseSnapshot(contents).tables).toEqual(useData.getState().tables);
    expect(useData.getState().settings.lastBackupAt).toBe(now.getTime());

    expect(await backUpIfDue(write, new Date(2026, 8, 30, 18, 0))).toBe(false);
    setSetting('backupsEnabled', false);
    expect(await backUpIfDue(write, new Date(2026, 9, 1, 9, 0))).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('doesn’t count a noted backup (before an import) as the daily one', async () => {
    const write = vi.fn(async () => {});
    await backUp(write, new Date(2026, 8, 30, 9, 0), 'before-import');
    expect(useData.getState().settings.lastBackupAt).toBe(DEFAULT_SETTINGS.lastBackupAt);
  });
});

describe('snapshots with sections', () => {
  // Bug prevented: sections lost on export and import, or tasks coming back in the wrong section.
  it('round-trips an export with sections and sectioned tasks', () => {
    const list = createList({ type: 'todo', title: 'Home' });
    const section = createSection(list, 'Kitchen')!;
    setSectionCollapsed(section, true);
    const task = createItem(list, { text: 'Paint', sectionId: section })!;
    const { tables } = useData.getState();
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables).toEqual(tables);
    expect(parsed.tables.sections[section]).toMatchObject({ title: 'Kitchen', collapsed: true });
    expect(parsed.tables.items[task].sectionId).toBe(section);
    expect(JSON.parse(exportNow()).version).toBe(1);
  });

  // Bug prevented: an export made before sections existed being refused, or loading with undefined fields.
  it('reads an old export with no sections table or sectionId as having none', () => {
    const json = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {
        lists: [{ id: 'L', type: 'todo', title: 'T', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
        items: [{ id: 'I', listId: 'L', text: 'x', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
      },
      settings: {},
    });
    const { tables } = parseSnapshot(json);
    expect(tables.sections).toEqual({});
    expect(tables.items.I.sectionId).toBeNull();
  });

  it('points at the section row that is wrong', () => {
    const bad = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: { sections: [{ id: 'S', title: 'x', sortKey: 'a0', createdAt: 1, updatedAt: 1 }] },
      settings: {},
    });
    expect(() => parseSnapshot(bad)).toThrow(/section 1, listId should be an id/);
  });
});

describe('snapshots with filters', () => {
  // Bug prevented: saved filters, or the sort and group choices, lost on export and import.
  it('round-trips filters and the view and matrix settings, without changing the version', () => {
    const list = createList({ type: 'todo', title: 'Home' });
    const f = createFilter({ name: 'Week', query: '#Home & 7 days', color: 'teal' })!;
    setSetting('viewOptions', { today: { sort: 'priority', group: 'list', layout: 'list' } });
    setSetting('matrix', { urgent: '3 days', important: 'p1' });
    const { tables } = useData.getState();
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables).toEqual(tables);
    expect(parsed.tables.filters[f]).toMatchObject({ name: 'Week', query: '#Home & 7 days' });
    expect(parsed.settings).toMatchObject({
      viewOptions: { today: { sort: 'priority', group: 'list', layout: 'list' } },
      matrix: { urgent: '3 days', important: 'p1' },
    });
    expect(parsed.tables.lists[list]).toBeTruthy();
    expect(JSON.parse(exportNow()).version).toBe(1);
  });

  // Bug prevented: an export made before filters existed being refused, or a hand-edited
  // viewOptions with nonsense in it crashing the views.
  it('reads an old export with no filters table, and drops malformed view options', () => {
    const json = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {
        lists: [{ id: 'L', type: 'todo', title: 'T', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
      },
      settings: {
        viewOptions: {
          today: { sort: 'name', group: 'bogus' },
          'list:L': { sort: 'manual', group: 'default' },
          broken: 'nope',
        },
        matrix: { urgent: 'p1' },
      },
    });
    const { tables, settings } = parseSnapshot(json);
    expect(tables.filters).toEqual({});
    expect(settings.viewOptions).toEqual({
      today: { sort: 'name', group: 'default', layout: 'list' },
    });
    expect(settings.matrix).toBeUndefined();
  });

  it('points at a filter row that is wrong', () => {
    const bad = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: { filters: [{ id: 'F', name: 'X', sortKey: 'a0', createdAt: 1, updatedAt: 1 }] },
      settings: {},
    });
    expect(() => parseSnapshot(bad)).toThrow(/filter 1, query should be text/);
  });
});

describe('snapshots with labels', () => {
  // Bug prevented: labels or the labels on tasks lost on export and import.
  it('round-trips an export with labels and labelled tasks, without changing the version', () => {
    const list = createList({ type: 'todo', title: 'Home' });
    const a = createLabel('Errands', { color: 'red' })!;
    const b = createLabel('deep work')!;
    const task = createItem(list, { text: 'Paint', labelIds: [b, a] })!;
    const { tables } = useData.getState();
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables).toEqual(tables);
    expect(parsed.tables.labels[a]).toMatchObject({ name: 'Errands', color: 'red' });
    expect(parsed.tables.items[task].labelIds).toEqual([b, a]);
    expect(JSON.parse(exportNow()).version).toBe(1);
  });

  // Bug prevented: an export made before labels existed being refused, or loading with undefined fields.
  it('reads an old export with no labels table or labelIds as having none', () => {
    const json = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {
        lists: [{ id: 'L', type: 'todo', title: 'T', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
        items: [{ id: 'I', listId: 'L', text: 'x', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
      },
      settings: {},
    });
    const { tables } = parseSnapshot(json);
    expect(tables.labels).toEqual({});
    expect(tables.items.I.labelIds).toEqual([]);
  });

  it('points at a label row that is wrong, and refuses a labelIds that is not a list of ids', () => {
    const bad = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: { labels: [{ id: 'B', sortKey: 'a0', createdAt: 1, updatedAt: 1 }] },
      settings: {},
    });
    expect(() => parseSnapshot(bad)).toThrow(/label 1, name should be text/);
    const bad2 = JSON.stringify({
      app: 'checklist',
      version: 1,
      tables: {
        items: [
          {
            id: 'I',
            listId: 'L',
            text: 'x',
            labelIds: 'B',
            sortKey: 'a0',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      settings: {},
    });
    expect(() => parseSnapshot(bad2)).toThrow(/item 1, labelIds should be a list of ids/);
  });
});

describe('snapshots of end times and deadlines', () => {
  const load = (fields: Record<string, unknown>) =>
    parseSnapshot(
      JSON.stringify({
        app: 'checklist',
        version: 1,
        tables: {
          lists: [{ id: 'L', type: 'todo', title: 'T', sortKey: 'a0', createdAt: 1, updatedAt: 1 }],
          items: [
            {
              id: 'I',
              listId: 'L',
              text: 'x',
              sortKey: 'a0',
              createdAt: 1,
              updatedAt: 1,
              ...fields,
            },
          ],
        },
        settings: {},
      }),
    ).tables.items.I;
  const due = { dueDate: '2026-10-03', dueTime: '14:00' };

  // Bug prevented: an end time with no start time loading, and showing a range with no start.
  it('drops an end time that has no due time', () => {
    expect(load({ dueDate: '2026-10-03', endTime: '15:00' }).endTime).toBeNull();
  });

  // Bug prevented: an import carrying a range that ends before (or when) it starts.
  it('drops an end time that is not after the due time', () => {
    expect(load({ ...due, endTime: '14:00' }).endTime).toBeNull();
    expect(load({ ...due, endTime: '13:00' }).endTime).toBeNull();
  });

  // Bug prevented: a valid range being lost on import, or a deadline not round-tripping.
  it('keeps a valid range and a deadline, and round-trips them', () => {
    expect(load({ ...due, endTime: '15:30' })).toMatchObject({
      dueTime: '14:00',
      endTime: '15:30',
    });
    const list = createList({ type: 'todo', title: 'Work' });
    createItem(list, { text: 'A', ...due, endTime: '15:30', deadline: '2026-10-10' });
    const { tables } = useData.getState();
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables).toEqual(tables);
    expect(Object.values(parsed.tables.items)[0]).toMatchObject({
      endTime: '15:30',
      deadline: '2026-10-10',
    });
  });
});

describe('focus sessions in snapshots', () => {
  const session = {
    id: 'S1',
    itemId: 'I1',
    kind: 'stopwatch',
    startedAt: 1000,
    endedAt: 91000,
    seconds: 90,
  } as const;

  const withSessions = (rows: unknown[], settings: unknown = {}) =>
    JSON.stringify({ app: 'checklist', version: 1, tables: { focusSessions: rows }, settings });

  // Bug prevented: logged focus time lost in an export and import.
  it('round-trips a focus session', () => {
    commit('Log focus', (tx) => tx.put('focusSessions', session), { undoable: false });
    const parsed = parseSnapshot(exportNow());
    expect(parsed.tables.focusSessions).toEqual({ S1: session });
  });

  // Bug prevented: a session of an unknown kind (hand-edited file) loading and breaking totals.
  it('refuses a session with an unknown kind, naming it', () => {
    expect(() => parseSnapshot(withSessions([{ ...session, kind: 'nap' }]))).toThrow(
      /focus session 1/,
    );
  });

  // Bug prevented: a file exported before the focus timer existed being refused.
  it('parses a file without the table as having no sessions', () => {
    const old = JSON.stringify({ app: 'checklist', version: 1, tables: {}, settings: {} });
    expect(parseSnapshot(old).tables.focusSessions).toEqual({});
  });

  // Bug prevented: a nonsense timer length (0, text, huge, fractional) imported as a setting.
  it('drops invalid timer lengths and keeps a valid one', () => {
    for (const bad of [0, '25', 1000, 2.5]) {
      const { settings } = parseSnapshot(
        withSessions([], { focusMinutes: bad, breakMinutes: bad }),
      );
      expect(settings.focusMinutes).toBeUndefined();
      expect(settings.breakMinutes).toBeUndefined();
    }
    const { settings } = parseSnapshot(withSessions([], { focusMinutes: 45, breakMinutes: 10 }));
    expect(settings).toMatchObject({ focusMinutes: 45, breakMinutes: 10 });
  });
});
