import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from './data/memory';
import { createItem } from './store/actions/items';
import { createList } from './store/actions/lists';
import { resetForTests, useData } from './store/data';
import { seedIfNeeded } from './store/seed';
import { makeSnapshot, snapshotToJson } from './store/snapshot';
import { useUI } from './store/ui';

const platform = vi.hoisted(() => ({
  saveTextFile: vi.fn(),
  openTextFile: vi.fn(),
  saveFolder: vi.fn(),
  writeBackup: vi.fn(),
  quitApp: vi.fn(),
  cancelQuit: vi.fn(),
}));
vi.mock('./platform', async (original) => ({
  ...(await original<typeof import('./platform')>()),
  ...platform,
  canBackUp: true,
}));
const toasts = vi.hoisted(() => ({ message: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({
  toast: Object.assign(toasts.message, { error: toasts.error, dismiss: vi.fn() }),
}));

const { exportJson, exportMarkdown, importJson, quitWhenSaved } = await import('./dataCommands');

beforeEach(() => {
  vi.clearAllMocks();
  resetForTests(new MemoryRepository());
  useUI.setState({ dialog: null });
  seedIfNeeded();
});

/** Confirms the dialog `importJson` opened. */
async function confirm() {
  const dialog = useUI.getState().dialog;
  expect(dialog?.kind).toBe('confirm');
  if (dialog?.kind === 'confirm') dialog.onConfirm();
  await vi.waitFor(() => expect(toasts.message).toHaveBeenCalled());
}

describe('data commands', () => {
  it('exports everything as JSON under a dated name', async () => {
    platform.saveTextFile.mockResolvedValue(true);
    await exportJson();
    const [name, json, filter] = platform.saveTextFile.mock.calls[0];
    expect(name).toMatch(/^gettoit-\d{4}-\d{2}-\d{2}\.json$/);
    expect(filter.extensions).toEqual(['json']);
    expect(JSON.parse(json).tables.lists).toHaveLength(3);
    expect(toasts.message).toHaveBeenCalledWith('Exported 3 lists and 0 items');
  });

  it('says nothing when the save is cancelled', async () => {
    platform.saveTextFile.mockResolvedValue(false);
    await exportJson();
    expect(toasts.message).not.toHaveBeenCalled();
  });

  it('exports each list as a Markdown file in a dated folder', async () => {
    platform.saveFolder.mockResolvedValue(true);
    await exportMarkdown();
    const [folder, files] = platform.saveFolder.mock.calls[0];
    expect(folder).toMatch(/^gettoit-\d{4}-\d{2}-\d{2}$/);
    expect(files.map((f: { path: string }) => f.path).sort()).toEqual([
      'Groceries.md',
      'Inbox.md',
      'Welcome.md',
    ]);
  });

  it('imports after confirming, backing up first', async () => {
    const other = new MemoryRepository();
    resetForTests(other);
    const list = createList({ type: 'todo', title: 'Imported' });
    createItem(list, { text: 'From the file' });
    const { tables, settings } = useData.getState();
    const json = snapshotToJson(makeSnapshot(tables, settings));

    resetForTests(new MemoryRepository());
    seedIfNeeded();
    platform.openTextFile.mockResolvedValue(json);
    await importJson();
    const dialog = useUI.getState().dialog;
    expect(dialog).toMatchObject({
      title: 'Replace everything with this file?',
      message: expect.stringContaining('The file has 1 list and 1 item'),
    });
    await confirm();

    expect(platform.writeBackup).toHaveBeenCalledWith(
      expect.stringMatching(/-before-import\.json$/),
      expect.any(String),
      14,
    );
    // The backup holds what was there before.
    expect(platform.writeBackup.mock.calls[0][1]).toContain('Welcome');
    const lists = Object.values(useData.getState().tables.lists).map((l) => l.title);
    expect(lists).toEqual(['Imported']);
    // There's a default list again for quick-add.
    expect(useData.getState().settings.defaultListId).toBe(list);
    expect(useUI.getState().view).toEqual({ kind: 'list', listId: list });
    expect(toasts.message).toHaveBeenLastCalledWith('Imported 1 list and 1 item');
  });

  it('turns away a bad file without changing anything', async () => {
    platform.openTextFile.mockResolvedValue('{"app":"something else"}');
    const before = useData.getState().tables;
    await importJson();
    expect(useUI.getState().dialog).toBeNull();
    expect(toasts.error).toHaveBeenCalledWith(
      'Can’t import this file. The file isn’t a Get To It export.',
    );
    expect(useData.getState().tables).toBe(before);
  });

  it('quits once everything is saved', async () => {
    createList({ type: 'todo', title: 'Saved' });
    await quitWhenSaved();
    expect(platform.quitApp).toHaveBeenCalledOnce();
    expect(platform.cancelQuit).not.toHaveBeenCalled();
  });

  it('stays open and asks when the last changes can’t be saved', async () => {
    const repo = new MemoryRepository();
    vi.spyOn(repo, 'write').mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetForTests(repo);
    createList({ type: 'todo', title: 'Unsaved' });

    await quitWhenSaved();
    expect(repo.write).toHaveBeenCalledTimes(2);
    expect(platform.quitApp).not.toHaveBeenCalled();
    expect(platform.cancelQuit).toHaveBeenCalledOnce();
    const dialog = useUI.getState().dialog;
    expect(dialog).toMatchObject({ kind: 'confirm', title: 'Quit without saving?' });
    expect(dialog?.kind === 'confirm' && dialog.message).toContain('disk full');

    if (dialog?.kind === 'confirm') dialog.onConfirm();
    expect(platform.quitApp).toHaveBeenCalledOnce();
    resetForTests(new MemoryRepository());
    vi.restoreAllMocks();
  });
});
