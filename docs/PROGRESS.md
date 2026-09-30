# Progress and handoff notes

Read this with [PLAN.md](PLAN.md) before starting the next milestone. Work
happens one milestone per chat; update this file at the end of each one.

## Status

| #     | Milestone     | State                                                                  |
| ----- | ------------- | ---------------------------------------------------------------------- |
| M0    | Project setup | **Done**                                                               |
| M1    | App frame     | Next. Folder and list actions already written and tested (see below).  |
| M2–M8 |               | Not started. Several pure helpers they need already exist (see below). |

## How to run

```sh
npm install
npm run dev          # browser preview at http://localhost:1420 (data in localStorage)
npm run app:dev      # desktop app (needs Rust; on Linux also the webkit2gtk libraries)
npm test             # Vitest unit tests
npm run lint && npm run typecheck && npm run format:check
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

CI (`.github/workflows/ci.yml`) runs all of the above. `build.yml` builds an
unsigned macOS universal `.dmg` and a Windows `.exe` installer on every push
and uploads them as workflow artifacts.

## Architecture as built

### Desktop shell (`src-tauri/`)

- `db.rs`: SQLite via `rusqlite` (bundled). Two commands: `db_select(sql, params)`
  and `db_batch(statements)`, which runs a batch in one transaction. The
  database is `checklist.db` in the app data folder. This replaced
  `tauri-plugin-sql`, whose connection pool can't do multi-statement
  transactions. The schema lives in TypeScript, not Rust.
- `reminders.rs`: `set_reminder_schedule([{id, at, title, body}])`. A thread
  checks every second, shows a native notification and emits
  `reminder://fired` with `{id, at}`. The frontend owns all reminder logic
  and only hands over future fire times (to be wired up in M4).
- `files.rs`: `write_text_file`, `read_text_file`, `write_files(dir, files)`
  (relative paths only), `write_backup(name, contents, keep)` (into
  `<app data>/backups`, keeps the newest `keep`), `open_backups_folder`.
- `tray.rs`: tray icon with Show/Quit; `set_tray_tooltip(text)`.
- `lib.rs`: app lifecycle.
  - The window starts **hidden** and is shown when the frontend calls
    `app_ready` (already done in `src/main.tsx`), with a 4 s fallback.
  - Closing the window hides it to the tray while `set_close_to_tray(true)`
    (the default). Otherwise closing quits.
  - Quitting (tray Quit, Cmd+Q) emits `app://quit-requested`. The frontend
    should flush saves and call `quit_app`. The app exits anyway after 3 s.
    **The frontend listener is not written yet** (M4). Until then quitting
    takes 3 s, but saves are flushed within 150 ms of each change, so
    nothing is lost.
  - Launch at login passes `--hidden`, so the app starts in the tray.
  - Plugins: single-instance, autostart, window-state (not visibility),
    notification, dialog, opener, clipboard-manager.
    Permissions are in `capabilities/default.json`.
  - macOS uses an overlay title bar (`titleBarStyle: Overlay`, traffic
    lights at 16,20). **The M1 layout must leave about 28 px at the top of
    the sidebar and mark drag areas with `data-tauri-drag-region`.**

### Frontend (`src/`)

- `data/types.ts`: every entity type, `Settings` with defaults, and
  `Snapshot` (the export format).
- `data/repository.ts`: the `Repository` interface (`load`, `write(ops)`).
  Adapters:
  - `sqlite.ts`: column mapping plus migrations tracked with
    `PRAGMA user_version`. Hard deletes write a `tombstones` row.
  - `localStorage.ts`: browser preview.
  - `memory.ts`: tests.
- `platform/index.ts`: `isTauri`, `isMac`, `createRepository()`, `appReady()`.
  Put every other native call here too, with a browser fallback.
- `store/data.ts`: Zustand store `useData` holding `{ tables, settings, past, future, saveError }`.
  - **All data changes go through `commit(label, tx => ..., { coalesce?, undoable? })`.**
    It applies changes, queues saves (150 ms debounce, writes to the same row
    collapse, one retry) and records undo.
  - `undo()`, `redo()`, `undoEntry(id)` (for toast Undo buttons),
    `lastEntryId()`, `setSetting()`, `flushWrites()`.
  - Undo and redo re-stamp `updatedAt`.
- `store/history.ts`: `Tx` (`get`, `all`, `put`, `update`, which bumps
  `updatedAt`, and `remove`), `applyChanges`, `mergeEntries`.
- `store/tree.ts`: `childrenIndex`, `buildTree`, `flatten`,
  `descendantIds`, `subtreeHeight`, `depthOf`, `MAX_DEPTH = 3`, and
  `projectDrop`, which decides where a drag lands in the subtask tree,
  following dnd-kit's tree example.
- `store/actions/`
  - `folders.ts`: create, rename, color, collapse, move, delete. Deleting a
    folder moves its lists to the top level.
  - `lists.ts`: create (a note list also gets a `notes` row), rename, color,
    pin, show-completed, move, move to folder, archive, unarchive, delete
    (soft), restore, duplicate.
  - `helpers.ts`: `keyAt`, `siblings`, `listItems`.
- `lib/`
  - `dates.ts`: date keys (`YYYY-MM-DD`, local), formatting, `isOverdue`.
  - `recurrence.ts`: `nextDueDate`, `firstOccurrence`,
    `describeRecurrence`, `sanitizeRecurrence`.
  - `quickAdd.ts`: `parseQuickAdd`, which reads date, time, repeat and
    priority, and returns preview chips.
  - `richText.ts`: TipTap JSON to plain text and Markdown, `docFromText`,
    `isDocEmpty`.
  - `order.ts`: fractional sort keys. `id.ts`: ULIDs.
- `App.tsx` is a placeholder. `styles/index.css` has Tailwind and a couple of
  starter tokens.

### Conventions

- Soft delete with `deletedAt`. Only emptying the Trash hard-deletes.
- Sort order uses `sortKey` strings from `lib/order.ts`. Compare with `<`,
  not `localeCompare`.
- Due dates are local `dueDate` + optional `dueTime` strings, never timestamps.
- Prettier: single quotes, 100 columns, Tailwind class sorting.
- Tests sit next to their code as `*.test.ts`. `tsconfig.test.json` adds Node
  types, which the SQLite test needs because it uses `node:sqlite`.

## Deviations from the plan

- `rusqlite` behind two custom commands, instead of `tauri-plugin-sql`
  (reason above).
- Search will be in memory over the loaded data rather than SQLite FTS. The
  data is all loaded anyway, and it works the same in the browser preview.
- Repeat rules are stored as JSON (`Recurrence` in `types.ts`), not RRULE
  strings.

## Next: M1 (app frame)

1. Design tokens in `styles/index.css`: surfaces, text, border, accent, and
   the 10 list colors. Light and dark, following `settings.theme` through a
   `data-theme` attribute on `<html>`.
2. UI kit in `src/components/ui/` (Button, IconButton, Input, Dialog, Menu,
   ContextMenu, Popover, Tooltip, Kbd), built on `radix-ui`, with
   `lucide-react` icons and `sonner` toasts.
3. A `useUI` store: current view (today, upcoming, list, archive, trash),
   selected item, open dialogs.
4. Sidebar with a macOS drag region: Today, Upcoming, Pinned, unfiled lists,
   folders with their lists, Archive, Trash. dnd-kit to reorder and move
   lists between folders. Context menus for rename, color, pin, move,
   duplicate, archive, delete.
5. A New list dialog (type, name, folder).
6. Archive and Trash views: restore, delete forever, empty trash (not
   undoable; hard delete of the list's items, reminders, completions and
   note).
7. First-run seed: Inbox, Groceries, a Welcome note, and a Work folder. Set
   `defaultListId` and `seeded`.
8. Undo/redo shortcuts, skipped when focus is in an editable field. Toasts
   with Undo on deletes.
9. Placeholder main pane for each list type, to be filled in M2, M5 and M6.
