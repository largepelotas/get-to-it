# Progress and handoff notes

Read this with [PLAN.md](PLAN.md) before starting the next milestone. Work
happens one milestone per chat; update this file at the end of each one.

## Status

| #     | Milestone     | State                                                                  |
| ----- | ------------- | ---------------------------------------------------------------------- |
| M0    | Project setup | **Done**                                                               |
| M1    | App frame     | **Done**                                                               |
| M2    | To-do lists   | **Done**                                                               |
| M3    | Due dates     | Next (see the end of this file).                                       |
| M4–M8 |               | Not started. Several pure helpers they need already exist (see below). |

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
    lights at 16,20). The sidebar keeps a 44 px drag strip at the top on
    macOS (12 px elsewhere), and view headers are drag regions too.
    `data-tauri-drag-region` only applies to the element that has it, not
    its children, so put it on empty containers.
  - `setWindowTheme` (in `platform`) matches the native chrome to the app
    theme; it needs `core:window:allow-set-theme`.

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
  `projectDrop`, which decides where a drag lands in the subtask tree
  (parent, index and the sibling it lands after), following dnd-kit's tree
  example.
- `store/todo.ts`: `todoModel(items, listId)` splits a to-do list into
  `open` rows and `done` rows (finished top-level tasks with their subtasks,
  newest first). Finished subtasks of open tasks stay in place.
  `endOfSubtree(rows, i)`.
- `store/actions/`
  - `folders.ts`: create (`insertFolder` inside a transaction), rename,
    color, collapse, move, delete. Deleting a folder moves its lists to the
    top level.
  - `lists.ts`: create (`insertList` inside a transaction; a note list also
    gets a `notes` row), rename, color, pin, show-completed, move, move to
    folder, archive, unarchive, delete (soft), restore, duplicate.
  - `trash.ts`: `deleteListForever` and `emptyTrash`, the only hard deletes.
    Emptying removes trashed lists with their items, reminders, completions
    and note, plus deleted items and deleted folders everywhere.
  - `items.ts`: `insertItem`/`createItem` (placement via `parentId` and
    `after`: an id, `null` for first, left out for last),
    `createItemFromText` (runs `parseQuickAdd` when `settings.parseDates`),
    `setItemText` and `setItemNotes` (coalesced per item; blank text is
    ignored), `setChecked` (checking a parent checks its open subtasks;
    reopening a subtask reopens finished parents; `completedAt` is set),
    `deleteItems` (soft, with subtasks), `indentItem`/`outdentItem` (respect
    `MAX_DEPTH`; outdent lands right after the old parent), `moveItemBy`
    (Alt+↑/↓), `moveItem` (drag), `setPriority`, `clearDue`,
    `setItemCollapsed` (not undoable). `shownSiblings` treats finished and
    open top-level tasks as separate groups, since they're shown in
    separate sections. An open task never sits under a finished one: adding,
    moving or reopening a subtask reopens its ancestors.
  - `helpers.ts`: `keyAt`, `siblings`, `listItems`.
- `store/data.ts` also prunes history: a non-undoable commit that removes
  rows drops every undo/redo step touching them, so undo can't bring back
  half a list after the Trash is emptied.
- `store/ui.ts`: `useUI` with `view` (today, upcoming, list, archive,
  trash), `selectedItemId`, `detailsOpen`, `dialog` (new list or a
  confirmation) and `renaming` (the sidebar row with an inline rename
  field). Helpers: `navigate` (clears the selection and closes details),
  `openList`, `selectItem`, `openDetails`, `closeDetails`, `openDialog`,
  `confirmAction`, `startRename`.
- `store/sidebar.ts`: `sidebarModel` (pinned, unfiled, folders, archived,
  trashed), `openCounts`, `sidebarRows` (the flat draggable rows) and
  `resolveSidebarDrop`, which turns a dnd-kit drop into a `moveList` or
  `moveFolder`. A list joins the folder of the row above where it lands.
- `store/seed.ts`: `seedIfNeeded` creates Inbox, Groceries, a Welcome note
  and a Work folder on first launch (not undoable), and always makes sure
  `defaultListId` is set.
- `commands.ts`: user-facing commands that wrap store actions with
  navigation and toasts: trash/archive with an Undo toast (`undoEntry`),
  restore, duplicate, new folder (then inline rename), delete forever and
  empty Trash behind a confirmation, `trashItems` (Undo toast), undo/redo.
  `homeView()` is where to go when the open list disappears (the default
  list, else Today).
- `lib/`
  - `dates.ts`: date keys (`YYYY-MM-DD`, local), formatting, `isOverdue`.
  - `recurrence.ts`: `nextDueDate`, `firstOccurrence`,
    `describeRecurrence`, `sanitizeRecurrence`.
  - `quickAdd.ts`: `parseQuickAdd`, which reads date, time, repeat and
    priority, and returns preview chips.
  - `richText.ts`: TipTap JSON to plain text and Markdown, `docFromText`,
    `isDocEmpty`.
  - `order.ts`: fractional sort keys. `id.ts`: ULIDs.
  - `shortcuts.ts`: `matchesShortcut(event, 'Mod+Shift+Z', isMac)`,
    `formatShortcut` (⌘⇧Z vs Ctrl+Shift+Z) and `isEditableTarget`.
  - `theme.ts`: resolve and apply the theme, `colorVar(color)` for list
    colors, `COLOR_LABEL`.
- `hooks/`: `useApplyTheme`/`useResolvedTheme`, and `useAppShortcuts`
  (undo ⌘Z/Ctrl+Z, redo ⌘⇧Z/Ctrl+Shift+Z/Ctrl+Y, ignored in text fields).
  Add new global shortcuts there.

### Design system

- Tokens are CSS variables in `styles/index.css`, light on `:root` and
  dark on `[data-theme='dark']`. `<html data-theme>` is set from
  `settings.theme` (following the OS for "system") before the first paint
  and by `useApplyTheme`. The `dark:` variant follows `data-theme` too.
- Tailwind names map to the tokens: `bg-surface`, `bg-sidebar`,
  `bg-elevated`, `bg-hover`, `bg-selected`, `text-fg`, `text-fg-muted`,
  `text-fg-subtle`, `border-line`, `border-line-strong`, `bg-accent`,
  `text-accent-fg`, `bg-accent-soft`, `text-danger`, `bg-danger-soft`,
  `bg-overlay`, `shadow-popover`. Use these, not raw colors.
- The 10 list colors are `--list-<name>`; use `colorVar(name)` in a style.
- Prettier's Tailwind plugin reads `styles/index.css`
  (`tailwindStylesheet`), so custom classes sort correctly.

### UI kit (`src/components/ui/`)

`Button` (primary, secondary, ghost, danger, danger-secondary), `IconButton`
(label doubles as tooltip), `Input`, `Select` (native), `Label`, `Dialog`,
`Menu` and `ContextMenu`, `Popover`, `Tooltip` (+ `TooltipProvider` in
`App`), `Kbd`, `Swatch`, `Toaster` (sonner).

- Menus take entries as data (`MenuEntry`: item, separator, label, sub), so
  one builder serves the "…" button and the right-click menu. Pass a
  function to build them only when the menu opens. Falsy entries and stray
  separators are dropped.
- An entry that focuses something itself (Rename) sets `movesFocus`: it
  runs after the menu closes and the menu doesn't refocus its trigger.
  Without this, the menu's focus trap steals focus from the new field.
- `components/menus.tsx` builds the list and folder menus (different
  entries for archived and trashed lists).

### Screens

- `components/sidebar/`: `Sidebar` (Today, Upcoming, Pinned, Lists tree,
  Archive, Trash, New list, settings menu with the theme, and a warning
  icon when saving fails), `ListTree` (dnd-kit; pointer drag after 5 px,
  keyboard drag with Space so Enter still opens a row; a dragged folder
  hides its lists), `SidebarItem`, `RenameField` (double-click a list or
  use Rename).
- `components/views/`: `ListView` (editable title, "…" menu, banners for
  archived or trashed lists; a to-do list gets `TodoList` and the details
  panel; groceries are still a placeholder; notes show a read-only
  `RichTextPreview`), `TodayView` and `UpcomingView` placeholders,
  `ArchiveView` and `TrashView`.
- `components/items/` (to-do lists):
  - `TodoList`: quick-add, open rows (dnd-kit sortable), the inline
    new-task field ("draft"), and the collapsible Completed section
    (`list.showCompleted`). It owns keyboard handling and focus: actions
    ask for focus with `setFocus({ target, mode })`, applied in a layout
    effect after the next render.
  - `ItemRow`: grip (drag handle, shown on hover), collapse chevron,
    `Checkbox` (priority-coloured ring), the text field (as wide as its
    text, so clicking the rest of the row selects the row), then progress
    (`2/5`), a notes icon, the due date (read-only until M3) and a priority
    flag, and an "Open details" button. Right-click opens `itemMenu.tsx`.
    `DraftRow` is the new-task field.
  - `QuickAdd`: "Add a task" field with chips for what `parseQuickAdd`
    read. New tasks go to the end of the list.
  - `ItemDetails`: the side panel (title, due date with a clear button,
    priority, plain-text notes stored as a TipTap doc, subtasks with "Add
    subtask", a link up to the parent, created/completed time, Delete).
  - Two keyboard modes. **Text mode** (focus in a task's text): Enter opens
    the new-task field below, Backspace in an empty task without subtasks
    deletes it, ↑/↓ go to the row above/below, Mod+Enter toggles, Escape
    switches to row mode. **Row mode** (the row itself focused, e.g. after
    clicking beside the text): ↑/↓ select, Enter edits, Space or Mod+Enter
    toggles, Backspace/Delete deletes with an Undo toast, Escape closes
    details and then clears the selection. Both: Tab/Shift+Tab indent and
    outdent, Alt+↑/↓ move, Mod+I toggles details. In the new-task field:
    Enter adds and opens another below, Tab/Shift+Tab change its level,
    Escape or Backspace (empty) leave it; clicking away keeps what was typed.
  - Dragging: horizontal distance picks the depth (`INDENT` = 24 px per
    level) and the dragged row shows it; its subtasks are hidden while it
    moves. Rows render with x fixed at 0 in their own style, not with a
    dnd-kit modifier, because modifiers also zero the `delta.x` that
    `projectDrop` needs.
- `components/dialogs/Dialogs.tsx`: New list (type, name, folder) and the
  confirmation dialog, driven by `useUI.dialog`.
- `MainPane` switches on the view and goes to `homeView()` if the open list
  stops existing.

### Conventions

- Soft delete with `deletedAt`. Only emptying the Trash hard-deletes.
- Sort order uses `sortKey` strings from `lib/order.ts`. Compare with `<`,
  not `localeCompare`.
- Due dates are local `dueDate` + optional `dueTime` strings, never timestamps.
- Prettier: single quotes, 100 columns, Tailwind class sorting.
- Tests sit next to their code as `*.test.ts(x)`. `tsconfig.test.json` adds Node
  types, which the SQLite test needs because it uses `node:sqlite`.
- Component tests use Testing Library (`App.test.tsx` covers the frame end to
  end). `test/setup.ts` cleans up between tests.
- UI text uses British spelling ("colour", "Grey"), matching the history
  labels.

## Deviations from the plan

- `rusqlite` behind two custom commands, instead of `tauri-plugin-sql`
  (reason above).
- Search will be in memory over the loaded data rather than SQLite FTS. The
  data is all loaded anyway, and it works the same in the browser preview.
- Repeat rules are stored as JSON (`Recurrence` in `types.ts`), not RRULE
  strings.
- Pinned lists appear in the Pinned section and also stay in their folder.
- Emptying the Trash also purges deleted folders and deleted items, not
  only trashed lists.
- Quick-add puts new tasks at the end of the list rather than after the
  selected task; Enter on a task adds after that task instead.
- Task notes are plain text for now (stored as a TipTap doc, so M6 can
  swap in the rich editor without a migration).
- Outdenting follows Todoist: the task moves to just after its old parent,
  and the siblings below it stay where they were.

## Known gaps

From M2:

- Tab inside a list indents, so keyboard users leave the list by pressing
  Escape until the selection clears (focus goes to the list container),
  then Tab. Revisit in M8.
- Row-mode Space/Delete only work while the row has focus; after clicking
  a toolbar button, click the row again.
- Recurring tasks are just checked for now; M3 makes checking one move it
  to the next date.
- The production bundle went over Vite's 500 kB warning in M2 (476 kB
  before), mostly chrono-node, which quick-add now pulls in. TipTap will
  add more in M6. Consider code-splitting in M8.

From M1:

- Folders have no "…" button, so their menu is right-click only (lists have
  one in the header). Revisit in the M8 accessibility pass.
- The native window theme and macOS drag strip were checked in code only;
  the browser preview can't show them. Check them in `npm run app:dev`.

## Next: M3 (due dates, Today, Upcoming, recurring tasks)

1. Date actions in `store/actions/items.ts`: `setDue(id, date, time)`,
   `setRecurrence(id, rule)` (use `sanitizeRecurrence`), plus the recurring
   check: in `setChecked`, when the item has a `recurrence`, write a
   `completions` row, move `dueDate` with `nextDueDate`, reset its subtasks,
   and leave it unchecked. `clearDue` already exists.
2. A due-date picker (react-day-picker in a `Popover`) with quick choices
   (Today, Tomorrow, Next week, No date), a time field and a repeat
   editor. Put it in the details panel (which shows due dates read-only
   now) and in the row menu.
3. `TodayView` and `UpcomingView`: tasks from every live to-do list, via a
   pure model like `todoModel` (overdue + today; future grouped by day).
   Reuse `ItemRow` (it needs `list` context for read-only and the list
   name as a label) and a quick-add that writes to `settings.defaultListId`.
4. Rows already show `formatDue` with overdue in red, and quick-add
   already stores parsed dates and repeats.
5. Completion history in the details panel for recurring tasks.
