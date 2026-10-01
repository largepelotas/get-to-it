# Progress and handoff notes

Read this with [PLAN.md](PLAN.md) before starting the next milestone. Work
happens one milestone per chat; update this file at the end of each one.

## Status

| #   | Milestone     | State    |
| --- | ------------- | -------- |
| M0  | Project setup | **Done** |
| M1  | App frame     | **Done** |
| M2  | To-do lists   | **Done** |
| M3  | Due dates     | **Done** |
| M4  | Reminders     | **Done** |
| M5  | Grocery lists | **Done** |
| M6  | Notes         | **Done** |
| M7  | Search, etc.  | **Done** |
| M8  | Polish        | **Done** |

v1 is feature-complete. What's left before calling it 1.0 is checking the
native paths on real macOS and Windows machines (see the end of this file).

## How to run

```sh
npm install
npm run dev          # browser preview at http://localhost:1420 (data in localStorage)
npm run app:dev      # desktop app (needs Rust; on Linux also the webkit2gtk libraries)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests (builds, then serves on :4173)
npm run lint && npm run typecheck && npm run format:check
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

The end-to-end tests need a Chromium: `npx playwright install chromium`
once, or point `PW_CHROMIUM_PATH` at one. In the Claude Code cloud
environment use `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`, since the
preinstalled browsers don't match the Playwright version.

CI (`.github/workflows/ci.yml`) runs all of the above, the end-to-end tests
in their own job (the HTML report is uploaded when they fail). `build.yml`
builds an unsigned macOS universal `.dmg` and a Windows `.exe` installer on
every push and uploads them as workflow artifacts. Pushing a `v*` tag also
attaches them to a **draft** GitHub release; publish it by hand.

The version lives in `package.json` only: `tauri.conf.json` reads it from
there (`"version": "../package.json"`). Bump it before tagging.

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
  and hands over fire times (`store/reminderScheduler.ts`). The scheduler
  remembers which `(id, at)` pairs it fired and ignores them if they're sent
  again, since the frontend may resend one before it hears it fired; it
  forgets a pair once it's no longer sent.
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
    (`useAppLifecycle`) flushes saves and calls `quit_app`. The app exits
    anyway after 3 s.
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
- `data/repository.ts`: the `Repository` interface (`load`, `write(ops)`,
  and since M7 `replaceAll(data)` for imports). Adapters:
  - `sqlite.ts`: column mapping plus migrations tracked with
    `PRAGMA user_version`. Hard deletes write a `tombstones` row.
    `replaceAll` runs in one transaction and tombstones every row that
    doesn't come back.
  - `localStorage.ts`: browser preview.
  - `memory.ts`: tests.
- `platform/index.ts`: `isTauri`, `isMac`, `createRepository()`, `appReady()`,
  `setWindowTheme`, and since M4 `setReminderSchedule`, `onReminderFired`,
  `requestNotificationPermission`, `notify`, `setCloseToTray`,
  `getLaunchAtLogin` (null in the browser), `setLaunchAtLogin`,
  `onQuitRequested`, `quitApp` and `setTrayTooltip`, and since M6
  `openUrl` (only `isSafeUrl` links: the opener plugin in the app, a new
  tab in the browser). Native events go
  through `listenNative`, which returns an unsubscribe function right away.
  Since M7: `copyText` (clipboard plugin, else `navigator.clipboard`),
  `saveTextFile(name, contents, filter)` (save dialog, then
  `write_text_file`; the browser downloads), `openTextFile(filter)` (open
  dialog, then `read_text_file`; the browser uses a hidden file input),
  `saveFolder(folderName, files)` (asks for a folder and writes the files
  into a new subfolder with `write_files`; the browser downloads one
  combined `.md`), `canBackUp` (desktop only), `writeBackup` and
  `openBackupsFolder`. All return false or null when the user cancels.
  Put every other native call here too, with a browser fallback.
  - `browserScheduler.ts`: the browser preview's copy of the native
    scheduler (1 s tick, the Notification API, the same resend rule).
- `store/data.ts`: Zustand store `useData` holding `{ tables, settings, past, future, saveError }`.
  Since M7, `replaceData(data, keep)` swaps in an imported data set: it
  flushes pending saves, calls `replaceAll`, drops anything queued
  meanwhile, keeps the `keep` settings (`lastBackupAt`) and clears undo.
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
  - `notes.ts`: `setNoteContent(listId, doc)` stores the TipTap JSON and its
    `plainText` (for search), coalesced per note (`note:<id>`), so undo steps
    back one burst of typing. Unchanged content commits nothing; a missing
    `notes` row is created (not for a missing list).
  - `items.ts`: `insertItem`/`createItem` (placement via `parentId` and
    `after`: an id, `null` for first, left out for last; grocery items also
    pass `quantity` and `category`),
    `createItemFromText` (runs `parseQuickAdd` when `settings.parseDates`;
    an optional `defaultDue` is used when the text has no date),
    `setItemText` and `setItemNotes` (coalesced per item; blank text is
    ignored; notes take a doc or plain text, and a doc `isDocEmpty` calls
    empty is stored as null), `setChecked` (checking a parent checks its open subtasks;
    reopening a subtask reopens finished parents; `completedAt` is set;
    checking a **repeating** task instead writes a `completions` row, moves
    `dueDate` with `nextDueDate`, reopens its subtasks, leaves it unchecked
    and returns the new date; a repeating subtask checked along with its
    parent is simply checked),
    `deleteItems` (soft, with subtasks), `indentItem`/`outdentItem` (respect
    `MAX_DEPTH`; outdent lands right after the old parent), `moveItemBy`
    (Alt+↑/↓), `moveItem` (drag), `setPriority`, `clearDue` (also clears
    time and repeat), `setDue(id, date, time)` (an invalid or null date
    clears), `setDueTime` (coalesced; adds today if undated), `moveDueDates`
    (Today's "Move to today"), `setRecurrence` (sanitised; adds a date if
    missing and moves a weekly rule's date onto one of its days with
    `firstOccurrence`), `repeatsOnCheck`, `setItemCollapsed` (not undoable). `shownSiblings` treats finished and
    open top-level tasks as separate groups, since they're shown in
    separate sections. An open task never sits under a finished one: adding,
    moving or reopening a subtask reopens its ancestors.
  - `reminders.ts`: `addReminder(itemId, spec)` (relative
    `{offsetMinutes}` or absolute `{at}`; an identical reminder isn't added
    twice) and `removeReminder`, both undoable. Bookkeeping, outside undo
    history: `markFired`, `markSkipped`, `dismissReminders`,
    `snoozeReminder(id, '10m' | '1h' | 'tomorrow')`. `clearSnoozes(tx,
itemId)` runs from every due-date change in `items.ts` (set, clear,
    time, move, repeat, completing an occurrence), so an old snooze can't
    hold back the reminder for a new date.
  - `grocery.ts`: `createGroceryItem(listId, raw)` (reads the quantity
    with `parseGroceryText`, then files it with `guessCategory` using
    `categoryHistory`), `setQuantity` (coalesced; blank clears),
    `setCategory(id, categoryId | null)` (lands at the end of that category),
    `moveGroceryItem(id, groupId, { after } | { before })` (drag and
    Alt+↑/↓; a different group changes the category, `other` meaning none),
    `uncheckAll(listId)` and `clearChecked(listId)` (soft delete), both
    returning how many items they touched. `groceryListIds(tables)`.
  - `helpers.ts`: `keyAt`, `siblings`, `listItems`.
- `commit`, `undo` and `redo` queue their save **before** updating the
  store. Store listeners may commit in response (the reminder scheduler
  does), and that newer write has to be queued last or the older row
  overwrites it on disk.
- `store/data.ts` also prunes history: a non-undoable commit that removes
  rows drops every undo/redo step touching them, so undo can't bring back
  half a list after the Trash is emptied.
- `store/grocery.ts`: `groceryModel(items, listId, categories)` gives
  `groups` (categories with open items, in settings order, then `OTHER_CATEGORY`
  for items with no category or a removed one), `cart` (checked items,
  newest first) and `open` (the grouped items in display order). Grocery
  items are flat; a `parentId` is ignored. `groupOf(item, categories)` and
  `categoryHistory(items, groceryListIds)`: the last category each
  normalised name was filed under in any grocery list, deleted items
  included (cleared items are the best record).
- `store/smart.ts`: `dueRows(items, lists)` gives open, dated tasks from
  live to-do lists as `DueRow`s (a flat `FlatRow` plus `list` and `parent`),
  sorted by date, then timed before untimed, then priority, then list and
  position. `todayModel` (overdue, today), `upcomingModel` (groups by day,
  after today only) and `todayCount` (the sidebar badge).
- `store/reminderScheduler.ts`: `startReminderScheduler({ setSchedule,
onFired, onMissed })`, started by `useReminderScheduler` in `App`. On
  start and on every change to items, lists, reminders or the all-day time
  it runs `planSchedule` and sends every upcoming fire time. Fired events
  call `markFired`. Past, undelivered reminders are handled three ways:
  at launch they're **missed** (marked fired so they land in the inbox, and
  `announceMissed` shows a toast plus one native notification); if they
  were in the last schedule they're sent again (the scheduler is firing
  them); otherwise an edit put them in the past (a reminder added for a
  time that's gone, a due date moved back, a task reopened or restored)
  and they're **skipped**: marked done without firing. Marking commits
  from inside the store listener, so passes repeat until nothing changes.
- `store/ui.ts`: `useUI` with `view` (today, upcoming, reminders, list,
  archive, trash), `selectedItemId`, `detailsOpen`, `duePickerFor` (the item whose
  due-date popover is open in the details panel; `pickDueDate(id)` opens
  the panel with it), `dialog` (new list, settings or a
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
  empty Trash behind a confirmation, `trashItems` (Undo toast), undo/redo,
  and `toggleItem(id, checked, { announce })`, which every checkbox uses: a
  repeating task gets a "next due on Friday" toast with Undo, and
  `announce` (Today/Upcoming) confirms ordinary completions the same way.
  Groceries: `uncheckCart` and `clearCart`, each with an Undo toast.
  Reminders: `remind` (adds, and asks for notification permission),
  `snooze` (toast with the new time), `dismiss`, `completeFromReminder`
  (dismisses, then `toggleItem` with `announce`) and `announceMissed`.
  `homeView()` is where to go when the open list disappears (the default
  list, else Today). Since M7: `copyAsMarkdown(listId)` (toast, or an
  error toast if the clipboard refuses) and `revealItem(id)` (opens the
  item's list, expands collapsed parents, shows the Completed or cart
  section if the item is there, selects it, opens details for to-dos and
  sets `useUI.reveal` so the list focuses the row).
- `dataCommands.ts` (M7): `exportJson`, `exportMarkdown`, `importJson`
  (open, `parseSnapshot`, confirm with what the file holds, back up first in
  the desktop app, `replaceData`, `seedIfNeeded` for a default list, go
  home), `backUpNow` and `showBackups`. Used by Settings and the palette.
- `store/search.ts` (M7): `search(tables, query)` returns `{ lists, items,
notes }`, each sorted by score and capped. Case and accents are ignored
  (`fold` keeps a map back to the original, so highlights land on the
  right characters), and every word of the query must match somewhere:
  list titles; item text plus task notes; note titles plus bodies. Scores:
  whole field > start of field > start of a word > inside a word; notes
  text counts half; archived lists and finished items rank lower; trashed
  lists and deleted items are left out. Results carry `Snippet`s (`text`
  plus `ranges`) for highlighting, and `makeSnippet` cuts long text to one
  line around the first match. Folded text and parsed task notes are
  cached per row object (rows are never mutated), which keeps a keystroke
  around 25 ms at 20,000 items. `scoreText` scores any string the same way.
- `store/markdown.ts` (M7): `listToMarkdown` (to-do lists as `- [ ]`
  task lists with subtasks indented, task notes under their task, due
  date, repeat and priority in brackets and a Completed section; grocery
  lists by category with quantities and an In cart section; notes via
  `docToMarkdown`), `safeFileName` and `markdownFiles` (one file per list,
  in a subfolder per folder, archived lists under `Archive/`, clashes
  numbered, Trash left out).
- `store/snapshot.ts` (M7): `makeSnapshot` (every row, soft-deleted ones
  included, and the settings except `lastBackupAt`), `snapshotToJson`,
  `parseSnapshot` (checks every field of every row against a table of
  checks and throws `ImportError` with a message such as "In item 3,
  dueDate should be a date (YYYY-MM-DD)."; missing optional fields get
  defaults; unknown or mistyped settings are dropped) and
  `describeContents` ("3 lists and 12 items", Trash left out).
- `store/backup.ts` (M7): `backupName` (`checklist-2026-09-30-221500.json`,
  which sorts by age as `prune_backups` needs), `backupDue` (none yet
  today, or the clock went backwards), `backUp(write, now, note?)` (a noted
  backup such as `before-import` doesn't count as the daily one) and
  `backUpIfDue`. `BACKUPS_KEPT` is 14.
- `lib/`
  - `dates.ts`: date keys (`YYYY-MM-DD`, local), formatting (`formatDue`,
    `formatDateKey` relative labels, `formatLongDate`, `formatShortDate`),
    `isOverdue`, `nextWeekKey` (follows `settings.weekStartsOn`),
    `msUntilTomorrow`.
  - `recurrence.ts`: `nextDueDate`, `firstOccurrence`,
    `describeRecurrence`, `sanitizeRecurrence`.
  - `reminders.ts`: `fireTime` (relative: the due moment, at `dueTime` or
    `settings.allDayReminderTime`, minus `offsetMinutes`; absolute: `at`;
    a later `snoozedUntil` wins), `reminderState(r, at, now)` (scheduled,
    due, fired, done: `firedFor`/`dismissedFor` hold the fire time they were
    for, so a moved date resets them), `isRemindable` (open task, live
    list), `reminderEntries` (soonest first), `inboxEntries` (fired, newest
    first), `planSchedule`, `notificationFor`, the presets
    (`TIMED_PRESETS`, `ALL_DAY_PRESETS`, `presetsFor`), `describeReminder`,
    `formatOffset` and `snoozeUntil`.
  - `quickAdd.ts`: `parseQuickAdd`, which reads date, time, repeat and
    priority, and returns preview chips.
  - `grocery.ts`: `parseGroceryText` (a leading or trailing quantity:
    "2 lemons", "2x lemons", "500g flour", "½ lemon", "milk 1 l",
    "lemons x2"; units from a fixed list; text that's only numbers stays the
    name), `normalizeName` (lower case, no accents or punctuation, a simple
    English singular per word), `keywordCategory` (a keyword table per
    default category id: longest phrase wins, then the last word, and
    "frozen" beats everything) and `guessCategory(name, categories,
history)`, which only returns categories that still exist.
  - `richText.ts`: TipTap JSON to plain text and Markdown, `docFromText`,
    `isDocEmpty`.
  - `links.ts`: `isSafeUrl` (http, https, mailto) and `normalizeUrl` for
    typed addresses ("example.com" → https, "sam@example.com" → mailto;
    null for anything else).
  - `order.ts`: fractional sort keys. `id.ts`: ULIDs.
  - `shortcuts.ts`: `matchesShortcut(event, 'Mod+Shift+Z', isMac)`,
    `formatShortcut` (⌘⇧Z vs Ctrl+Shift+Z) and `isEditableTarget`.
  - `theme.ts`: resolve and apply the theme, `colorVar(color)` for list
    colors, `COLOR_LABEL`.
- `hooks/`: `useApplyTheme`/`useResolvedTheme`, `useToday` (today's date
  key; re-renders at midnight and on window focus), `useNow` (the time to
  the minute, for render code: the React lint rejects `Date.now()` in
  render), `useReminderScheduler` and `useReminderEntries` (`{ all, inbox
}`), `useAppLifecycle` (close to tray follows the setting, the quit
  listener, and the tray tooltip: "Checklist · 3 due today, 1 reminder"),
  `useAppShortcuts` and `useBackups` (M7: the daily backup, checked 15 s
  after launch and then hourly, desktop only; one error toast if it fails).
- `lib/keymap.ts` (M7): `SHORTCUTS`, every app-wide shortcut by name, and
  `SHORTCUT_HELP`, what the Keyboard shortcuts dialog lists. Menus show
  shortcuts from here too. `useAppShortcuts` handles them: the palette
  (⌘K or ⌘F) works everywhere, even in text fields, and closes the palette
  when it's open; Settings (⌘,), the shortcuts dialog (⌘/), New list (⌘⇧N),
  New task (⌘N, focuses the view's `[data-quick-add]` field with
  `focusQuickAdd`) and the views (⌘1–3) work everywhere unless a dialog
  is open; undo, redo and Copy as Markdown (⌘⇧C) are ignored in text
  fields. Task rows handle ⌘D (due-date picker) and ⌘I themselves.

### Design system

- Tokens are CSS variables in `styles/index.css`, light on `:root` and
  dark on `[data-theme='dark']`. `<html data-theme>` is set from
  `settings.theme` (following the OS for "system") before the first paint
  and by `useApplyTheme`. The `dark:` variant follows `data-theme` too.
- Colour schemes: five palettes shared with another project (Graphite and
  cobalt, Stone and moss, Sage study, Midnight ink, Dusk), each with a light
  and a dark theme, picked in Settings or the palette ("Use the … colour
  scheme"). `settings.palette` (`PaletteName`, default `graphite`, the
  closest to the original look) is exported and imported like `theme`.
  `applyPalette` sets `<html data-palette>`, left off for Graphite, whose
  values are the bare `:root` rules; each other palette has a
  `[data-palette='…']` rule and a `[data-palette='…'][data-theme='dark']`
  one. Values come from another project's DESIGN.md: `surface` is its `bg`,
  `sidebar` its rail, `elevated` its raised surface, `fg`/`fg-muted`/
  `fg-subtle` its three inks, `hover` its ink wash, `danger` its fail
  colour; `selected` and `accent-soft` are the accent at 0.12 and
  `danger-soft` danger at 0.1, `accent-hover` and `danger-hover` move 12%
  toward black (light) or white (dark), and text on
  accent and danger fills is white in light themes and the rail colour in
  dark. The list colours are the user's choice and stay the same in every
  palette. `styles/tokens.test.ts` checks every text colour on every surface
  and wash in all ten combinations (4.5:1), and that no palette leaves out a
  token. It also checks non-text contrast (3:1, WCAG 1.4.11) on every
  surface, hovered and selected rows included: `--line-control` (the
  palette's `line-strong` moved toward its ink), the accent (focus ring), and
  the list colours, whose light values were darkened in OKLCH lightness
  (hue kept) to reach 3:1 on every palette.
- Tailwind names map to the tokens: `bg-surface`, `bg-sidebar`,
  `bg-elevated`, `bg-hover`, `bg-selected`, `text-fg`, `text-fg-muted`,
  `text-fg-subtle`, `border-line`, `border-line-strong`,
  `border-line-control` (borders that show where a control is: checkbox
  rings, text fields, the quick-add fields), `bg-accent`,
  `text-accent-fg`, `bg-accent-soft`, `text-danger`, `text-danger-fg`
  (text on `bg-danger`), `bg-danger-soft`, `bg-overlay`, `shadow-popover`.
  Use these, not raw colors.
- Since M8 every text token meets WCAG AA (4.5:1) on every surface it's
  used on, selected and hovered rows included: `fg-subtle` and `fg-muted`
  are darker in light mode and lighter in dark mode than before, the light
  accent is darker, the dark accent lighter, and text on the dark theme's
  accent and danger fills is dark (`--accent-fg`, `--danger-fg`). The
  accessibility e2e test checks this with axe in every palette and both
  themes, so a new colour that's too faint fails CI.
- The 10 list colors are `--list-<name>`; use `colorVar(name)` in a style.
- Rich text (the editor, task notes and `RichTextPreview`) renders the
  same HTML under `.rich-text`, styled in `index.css` (Tailwind's reset
  strips list markers and heading sizes). `.rich-text-compact` is the
  smaller scale for task notes.
- Prettier's Tailwind plugin reads `styles/index.css`
  (`tailwindStylesheet`), so custom classes sort correctly.

### UI kit (`src/components/ui/`)

`Button` (primary, secondary, ghost, danger, danger-secondary), `IconButton`
(label doubles as tooltip), `Input`, `Select` (native), `Label`, `Dialog`,
`Menu` and `ContextMenu`, `Popover` (`onCloseAutoFocus` to send focus
somewhere other than the trigger), `Tooltip` (+ `TooltipProvider` in
`App`), `Kbd`, `Swatch`, `Toaster` (sonner).

- Menus take entries as data (`MenuEntry`: item, separator, label, sub), so
  one builder serves the "…" button and the right-click menu. Pass a
  function to build them only when the menu opens. Falsy entries and stray
  separators are dropped.
- An entry that focuses something itself (Rename) sets `movesFocus`: it
  runs after the menu closes and the menu doesn't refocus its trigger.
  Without this, the menu's focus trap steals focus from the new field.
- `components/menus.tsx` builds the list and folder menus (different
  entries for archived and trashed lists; grocery lists also get Uncheck
  all and Clear checked, disabled while the cart is empty).
- `ContextMenu` also opens from the keyboard (M8): Shift+F10 or the Menu
  key on the focused element dispatches a `contextmenu` event at its
  bottom-left corner. Every right-click menu (task and grocery rows,
  sidebar lists and folders) gets this for free.
- `Checkbox` is out of the Tab order unless `tabbable` (rows handle Space
  themselves); the details panel's checkboxes are tabbable.

### Screens

- `components/sidebar/`: `Sidebar` (Today, Upcoming, Reminders with the
  inbox count, Pinned, Lists tree, Archive, Trash, New list, settings menu
  with the theme and "Settings…", and a warning icon when saving fails), `ListTree` (dnd-kit; pointer drag after 5 px,
  keyboard drag with Space so Enter still opens a row; a dragged folder
  hides its lists), `SidebarItem`, `RenameField` (double-click a list or
  use Rename).
- `components/views/`: `ListView` (editable title, "…" menu, banners for
  archived or trashed lists; a to-do list gets `TodoList` and the details
  panel; a grocery list gets `GroceryList`; a note gets the editor, keyed
  by list and read-only when archived or trashed), `SmartViews` (`TodayView`: Overdue with "Move to
  today", then Today; `UpcomingView`: a section per day. Both have a
  quick-add into `settings.defaultListId`, falling back to any live to-do
  list, with a default due date of today or tomorrow, and the details
  panel), `RemindersView` ("Reminded": the inbox, newest first, with
  Complete, a Snooze menu and Dismiss per row and "Dismiss all"; "Coming
  up": scheduled reminders; clicking a row opens the details panel),
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
    (`2/5`), a notes icon, the due date (red when overdue, with a repeat
    icon) and a priority flag, and an "Open details" button. Right-click
    opens `itemMenu.tsx` (with a Due date submenu: Today, Tomorrow, Next
    week, Pick a date…, No date). With `origin` (Today/Upcoming) it drops
    the tree controls and shows "List › Parent" with the list colour;
    `timeOnly` shows just the time under a day heading; `onToggle`
    overrides the check action. `DraftRow` is the new-task field.
  - `SmartList`: the rows of Today and Upcoming in titled sections. Rows
    can be edited, checked (focus moves to the next row) and deleted, not
    nested or reordered. Keys: ↑/↓, Enter (edit/leave), Space or Mod+Enter,
    Backspace/Delete, Escape, Mod+I. The menu adds "Go to list".
  - `DuePicker`: quick choices, a react-day-picker calendar (styled by
    `.due-picker` rules in `index.css`, over the library's stylesheet), a
    time field and the repeat editor (presets named with
    `describeRecurrence`, or Custom: every N days/weeks/months/years,
    weekday toggles and "On a schedule"/"After I finish it"). Choosing a
    day closes the popover; time and repeat changes keep it open.
    `ItemDetails` lazy-loads it, since the calendar is only needed there.
  - `DetailsPanel`: the selected task's `ItemDetails`, optionally limited to
    one list (list views) or from any list (Today, Upcoming).
  - `QuickAdd`: "Add a task" field with chips for what `parseQuickAdd`
    read. New tasks go to the end of the list.
  - `ItemDetails`: the side panel (title, due date button opening the
    `DuePicker` popover plus a clear button, priority, rich-text notes
    (the compact editor), subtasks with "Add subtask", completion
    history for repeating tasks (newest first, five then "Show all"), a
    link up to the parent, created/completed time, Delete).
  - `ReminderField` (in `ItemDetails`, under Due): the task's reminders
    with their fire times (greyed once passed, "Snoozed to …", "Needs a due
    date"), a remove button, and an "Add reminder" menu with the presets
    for timed or all-day tasks (disabled without a due date, checked when
    already set) and "Custom date and time…", an inline `datetime-local`
    field.
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
- `components/editor/` (notes and task notes):
  - `RichTextField`: what views use. Lazy-loads `RichTextEditor` (TipTap
    is its own ~400 kB chunk) and shows `RichTextPreview` meanwhile.
  - `RichTextEditor`: StarterKit (headings 1–3, bold, italic, underline,
    strike, code, lists, quotes, code blocks, dividers, links, its own
    undo), task lists (nested) and a placeholder. The `note` variant has
    the full toolbar, sticky above the text; `compact` (task notes) has
    Bold, Italic, Bulleted list, Checklist and Link below the field, shown
    on hover or focus. Markdown-style input rules come with the
    extensions (`# `, `- `, `1. `, `[ ] `, `> `, three backticks, `---`,
    `**bold**`, `` `code` ``). It keeps the content it last saved or loaded
    in a ref; when the stored content changes to something else (the app's
    undo, another edit) it replaces the doc without emitting or adding to
    its own history. An empty doc and null (task notes) count as equal.
  - Links: autolinked as you type and on paste. Clicks never navigate the
    webview (`openClickedLink`); Mod+click opens the link, and a plain click
    does when read-only.
  - `EditorToolbar`: `role=toolbar` with one tab stop (arrows, Home, End),
    `aria-pressed` from `useEditorState`, and buttons that don't take focus
    from the text. The link button opens a popover: address field (Enter
    applies, blank removes, anything `normalizeUrl` rejects shows an
    error), Open and Remove. With no selection it inserts the address as
    linked text. Closing it puts focus back in the editor.
- `RichTextPreview` renders a doc read-only with the same elements TipTap
  does. Links in it open with a plain click.
- `components/grocery/` (grocery lists, no details panel):
  - `GroceryList`: `GroceryQuickAdd`, a section per category (`role=list`
    named after it), "Everything’s in the cart." when only the cart is
    left, and the collapsible "In cart" section (uses `list.showCompleted`)
    with Uncheck all and Clear checked buttons. One dnd-kit
    `SortableContext` spans every category, so dropping an item among
    another category's items files it there. Keys, like `TodoList`: row
    mode ↑/↓, Enter (edit the name), Space or Mod+Enter (to the cart; focus
    stays in the section), Backspace/Delete (Undo toast), Alt+↑/↓ (within
    the category), Escape; in the name field Tab goes to the quantity,
    Enter/Escape go back to the row, and Backspace in an empty name deletes.
    The fields are out of the Tab order, so Tab from a row leaves the list.
  - `GroceryRow`: grip, `Checkbox`, the name and the quantity (a pill; an
    empty one shows a "Qty" placeholder on hover or when selected), the
    category name for items in the cart, and a Category menu button.
    Right-click: Category, Add/Edit quantity, Move up/down, Delete.
  - `GroceryQuickAdd`: "Add an item" with chips for the quantity and the
    category it will use.
  - `groceryMenu.tsx`: `categoryEntries` and `groceryMenuEntries`.
- `components/dialogs/Dialogs.tsx`: New list (type, name, folder) and the
  confirmation dialog, driven by `useUI.dialog`. `SettingsDialog.tsx`:
  theme, colour scheme, week start, reading dates in new tasks, the all-day reminder
  time, close to tray, open at login (read from and written to the
  autostart plugin, not stored in settings; disabled in the browser) and
  the grocery categories (`GroceryCategoriesEditor`: rename, reorder with
  arrow buttons, remove (not the last one), add, and Restore defaults).
  The dialog body scrolls.
- `MainPane` switches on the view and goes to `homeView()` if the open list
  stops existing.
- `components/palette/` (M7): `CommandPalette`, a Radix dialog around
  cmdk with `shouldFilter={false}` (search and matching are ours) and
  `vimBindings={false}` (cmdk otherwise swallows Ctrl+K/N/J/P). With no
  query it shows the lists in sidebar order, then every command. With a
  query, groups (Commands, Lists, Tasks and items, Notes) are ordered by
  their best score. The palette owns the highlighted row (`value`) and
  falls back to the first row whenever the chosen one isn't shown, since
  cmdk can lose it when groups reorder. Search runs synchronously so
  Enter always acts on the rows for what's typed. Choosing a row closes
  the palette and runs the action on the next tick; unless the command
  `keepsFocus`, it stops the dialog returning focus (Radix's close
  auto-focus would otherwise take it back from the revealed row or a new
  dialog). `paletteCommands(context)` builds the commands that apply
  (New task only with a quick-add field, Copy as Markdown in a list,
  Undo/Redo with the step's name, the other two themes and four colour schemes, export, import,
  backups in the desktop app, Empty Trash when there is one), and
  `commandScore` matches only words that start a word of the command's
  own label (`matchLabel`, so a list's title in "Copy “Work” as Markdown"
  doesn't match) or keywords.
- `TodoList` and `GroceryList` focus the row in `useUI.reveal` once it's
  rendered, then clear it.
- `dialogs/ShortcutsDialog.tsx` (M7) renders `SHORTCUT_HELP`. Settings
  has a Data section: Export…, Import…, Export as Markdown…, the daily
  backup toggle with the last backup time, Back up now and Show backups
  (the last three only in the desktop app). The sidebar's settings menu
  has Keyboard shortcuts, and list menus have Copy as Markdown.

- Everyday fixes (after M8): the task menu has Move to (any live to-do
  list; Undo toast), Duplicate and Won't do (a closed task sits in Completed
  with a cross instead of a tick; `Item.wontDo`, SQLite migration 2), and the
  Due date submenu has Skip this time for repeating tasks (also a button in
  the details panel). The due date on a row opens the picker. Today shows how
  many tasks it lists. ⌘\/Ctrl+\ hides the sidebar (`settings.sidebarHidden`,
  also in the palette and the sidebar's "…" menu); the main pane then shows a
  "Show sidebar" button (on macOS in its own drag strip, clear of the
  traffic lights).

- Quick add, finished (after M8): `parseQuickAdd` also reads `#List` (longest
  matching live to-do list title wins, any case; no match leaves the text
  alone) and `!` reminders (`!30min`, `!2 hours before`, `!due`, or a time
  like `!fri 9am`; a bare `!`, `!!`, `!!!` is still priority). A relative
  reminder is dropped when the task has no due date. `createItemFromText`
  files the task and its reminder in one undo step (`insertReminder` is the
  `Tx`-level half of `addReminder`); `createItemsFromLines` makes one task
  per line in one step. Pasting two or more lines into the field shows "Add N
  tasks" / "Paste as one task" (200-line cap). Mod+Shift+A, and Mod+N in a
  view with no field, open the "Add a task" dialog with a list picker (open
  list, else default list, else Inbox; Today gives today's date), and the
  palette has "Add a task to…". The toast ("Added to …", with Undo) is in
  `commands.ts` (`quickAddTask`, `quickAddLines`).

- Select several tasks (after M8): in to-do lists, Today and Upcoming,
  Ctrl/Cmd+click toggles a task, Shift+click and Shift+↑/↓ select a range,
  Mod+A selects every shown row, and Escape goes back to the focused row.
  `useUI.multiSelectedIds` holds the group while it has two or more tasks
  (`selectedItemId` stays the focused one, `selectionAnchor` starts ranges);
  `navigate` clears it and each list drops ids that leave the view. A
  floating `SelectionBar` (`role="toolbar"`, "N selected") offers Complete (or
  Mark not done), Date, Priority, Move to, Delete and a close button; the
  details panel is hidden meanwhile. Each action is one undo step and one
  toast through the many-id actions `setCheckedMany`, `setDueDates`,
  `setPriorities`, `moveItemsToList` (a task selected with its parent goes
  with the parent) and their wrappers in `commands.ts`. `keepFocus`
  (`items/selection.ts`) puts focus on the nearest remaining row, else the
  quick-add field, when an action removes the focused row. Selected rows carry
  `aria-current` and `data-multi-selected` (`aria-selected` isn't allowed on a
  list item). On a focused row E completes, T opens the due-date picker (or
  the bar's Date popover), 1–4 set the priority, V opens the "Move to…"
  dialog (`MoveTasksDialog`, built on cmdk, loaded on demand) and, in
  to-do lists only, Shift+A opens the new-task field at the top. Today's
  "Move to today" is now "Reschedule" (today, tomorrow, next week or a
  picked date, one undo step; `DateChoices` is shared with the bar).

- Smarter reminders and views (after M8): the `View` union has `tomorrow`
  and `next7`. `store/smart.ts` gained `tomorrowModel`, `next7Model`
  (an overdue list plus seven `DayGroup`s, empty days kept) and their
  counts. `SmartSection.emptyText` lets `SmartList` show "Nothing due"
  under an empty day's heading; empty sections add no rows, so arrow keys
  skip them. Quick add in Tomorrow dates tasks tomorrow, in Next 7 days
  today (and the "Add a task" dialog follows). The sidebar order is Today,
  Tomorrow, Next 7 days, Upcoming, Reminders. The setting `hiddenViews`
  (built-in view names, unknown ones dropped on load and import) leaves
  entries out of the sidebar only; the palette ("Go to Tomorrow", "Go to
  Next 7 days") and Today/Upcoming/Reminders shortcuts still work, the open
  view stays open, and a hidden Reminders entry shows while the inbox has
  something in it. Settings has a "Sidebar" group of "Show …" checkboxes.
  Constant reminders: `Reminder.constant` (SQLite migration 3, `constant
INTEGER NOT NULL DEFAULT 0`; missing in old localStorage data or exports
  reads as false; the snapshot `version` stays 1). A delivered (`fired`)
  constant reminder gets one extra scheduled notification, id
  `<reminderId>:again`, at `nextRepeatAt` (`lib/reminders.ts`: the next
  `fire time + k × REPEAT_EVERY`, 5 minutes, up to `REPEAT_LIMIT`, 2 hours),
  with "Still waiting · " in front of the body. When the platform reports it
  fired, `reminderScheduler` stores nothing and just runs another pass to
  queue the next one. Dismissing, snoozing, completing, deleting, removing,
  switching off or moving the time all end it, because the entry stops being
  `fired`. The native and browser schedulers are unchanged. `ReminderField`
  rows have a "Keep reminding" toggle (`setReminderConstant`, one undo step)
  and the inbox marks them "Repeats". The daily review is the setting
  `dailyReviewTime` (HH:mm or null): the pass adds a "Plan your day"
  notification with id `daily-review` at the next occurrence (`dailyReviewAt`),
  with a body from the due counts for the day it fires on. When it fires the
  scheduler calls `onDailyReview` (a toast with a Today button,
  `announceDailyReview`) and queues the next one; nothing is shown late if
  the app was closed. The scheduler subscription also watches
  `dailyReviewTime`.

- Sections (after M8): headings inside a to-do list. Data: the `sections`
  table (`Section`: `listId`, `title`, `sortKey`, `collapsed`), `Item.sectionId`
  (top-level tasks only; a subtask follows its top-level ancestor), SQLite
  migration 4; old data and exports load with none. Actions are in
  `store/actions/sections.ts` (`setSectionCollapsed` isn't an undo step, like
  collapsing a task) and `todoModel(items, listId, sections)` returns
  `unsectioned` and `sections` beside `open`. The screen draws groups
  (`TodoList.tsx`): the unsectioned tasks, then each `SectionHeading`
  (`role="heading"`, level 2, named "Title, N tasks", with an
  `aria-expanded` toggle) and its tasks. Headings are focusable and take part
  in Up/Down; Left/Right/Space collapse, Enter or F2 renames, Alt+Up/Down
  reorders; task keys do nothing on them. Selection ids are task rows only, so
  Ctrl+A and Shift ranges skip headings. Drag: one `DndContext` with headings
  as sortable ids (`section:<id>`); `planDrop` (`items/dropPlan.ts`) turns a
  drop into parent, "after" and section. A drop on an open heading goes to the
  section's start, on a collapsed one to its end; a drop on a task in another
  group lands after that task. While a heading is dragged the sections' tasks
  are hidden so headings reorder alone. In a trashed or archived list headings
  are static apart from collapsing. "Add section" is in the list menu and under
  the tasks (`addSection` in `commands.ts` opens the new heading for naming via
  `useUI.renamingSectionId`); deleting goes through `removeSection` (toast with
  Undo). The task menu has "Move to section" when the list has sections.
  `/section` is parsed with `#List` (see Quick add); `QuickAdd` passes the
  sections and its list so the chip shows `/Title`.

- Labels (after M8): tags that cut across lists. Data: the `labels` table
  (`Label`: `name`, `color`, `sortKey`), `Item.labelIds` (a `json` column,
  `label_ids`; ids naming no label are ignored), SQLite migration 5; old data
  and exports load with none, and the snapshot version is unchanged. Names are
  trimmed, lose a leading `@`, and are unique ignoring case. Actions are in
  `store/actions/labels.ts` (create, rename, colour, move, delete, set a
  task's labels, toggle one on several tasks, and `createLabelOnItems` for the
  picker's "Create"); the pure side (`itemLabels`, `labelRows`,
  `labelCounts`) is in `store/labels.ts`. Deleting a label takes it off every
  task in one undo step; there is no trash for labels. `@name` is parsed with
  `#List` and `/section`; new names are created in the same undo step as the
  task. The sidebar's Labels area (`LabelList.tsx`) shows once a label exists;
  the view (`LabelView.tsx`) is built on `SmartLayout` and puts its label on
  every task added there. Row chips (`LabelChips.tsx`) are neutral with a
  coloured dot, so contrast holds in every colour scheme; they open the label's
  view and are not tab stops. One picker (`LabelPicker.tsx`) serves every
  place labels are edited: a filter field, a checklist (ticked, or mixed when
  only some of several tasks have it) and `Create "name"`. Down/Up move, Enter
  or Space toggles, Escape closes. It opens in the details panel's "Labels"
  field (`useUI.labelPickerFor`, set by `pickLabels` from the L key and the
  menu's "New label…") and in the selection bar (`selectionLabelsOpen`). The
  task menu has a "Labels" submenu with ticks. Grocery lists and notes have no
  labels.

### Accessibility and loading (M8)

- **Row descriptions.** `describeRow` (`components/items/describeRow.ts`)
  puts what a task row shows into words ("Due Tomorrow 15:00. Repeats every
  day. Priority 1. Reminder set. 1 of 3 subtasks done. Has notes. In Work
  › Launch"). `ItemRow` renders it in a `hidden` span and points
  `aria-describedby` at it, so the row's name stays the task text; the
  icons and small text are `aria-hidden`. `GroceryRow` does the same with
  the quantity, "In cart" and the category.
- **Reminder bell.** Rows show a bell when the task has a reminder still to
  go off. `useItemsWithReminders()` (in `hooks/useReminders.ts`) builds the
  set once per list (`TodoList`, `SmartList`) and rows get `hasReminder`.
- **Regions and F6.** The sidebar, the open view and the details panel
  carry `data-region` (`sidebar`, `view`, `details`). F6 and Shift+F6
  (`cycleRegion` in `useAppShortcuts`) move between them, landing on the
  current thing (`aria-current`: the open list, the selected task), else
  the quick-add field, else the first control. This is how keyboard users
  leave a to-do list, where Tab indents.
- **Focus.** Closing the details panel from inside it (Escape, the close
  button) puts focus back on the task's row. Creating a list from the New
  list dialog focuses its quick-add field. The sidebar shows a "…" button
  on folder rows while hovered or focused (it's a sibling of the row, not
  inside it, since the row is itself a `role=button`; the row's count hides
  under it). The Reminders view's rows got their focus ring back.
- **Headings.** Every view has one `h1` (a list's title field sits inside
  one, so the heading's name is the title). Section headings in the details
  panel and grocery categories are `h2`.
- **Code-splitting.** The palette (with cmdk and search), Settings and the
  shortcuts dialog load through `lazyWithPreload` in
  `components/dialogs/lazy.tsx`: `Dialogs` preloads them 1.5 s after
  launch, and once loaded they render without suspending. React and
  React DOM are their own chunk (`codeSplitting.groups` in
  `vite.config.ts`; only add modules there that every screen needs, since a
  group is loaded as a whole). The main chunk went from 700 kB to 452 kB
  and the size warning is gone. chrono-node (45 kB) stays in the main chunk:
  quick-add parses synchronously as you type.

### Conventions

- Soft delete with `deletedAt`. Only emptying the Trash hard-deletes.
- Sort order uses `sortKey` strings from `lib/order.ts`. Compare with `<`,
  not `localeCompare`.
- Due dates are local `dueDate` + optional `dueTime` strings, never timestamps.
- Prettier: single quotes, 100 columns, Tailwind class sorting.
- Tests sit next to their code as `*.test.ts(x)`. `tsconfig.test.json` adds Node
  types, which the SQLite test needs because it uses `node:sqlite`.
- Component tests use Testing Library (`App.test.tsx` covers the frame end to
  end). `test/setup.ts` cleans up between tests and stubs pointer capture,
  which jsdom lacks and sonner's toasts call (without it Vitest reported an
  unhandled error and exited non-zero, even with every test passing). It
  also stubs `getClientRects`, `Range.getBoundingClientRect` and
  `elementFromPoint` for ProseMirror. With those, `user.type` and
  `user.keyboard` work in the editor, input rules included. Find it with
  `findByRole` (it's lazy-loaded), and in `user.keyboard` type `[` as `[[`.
- Date-dependent unit tests fake only `Date`
  (`vi.useFakeTimers({ toFake: ['Date'] })`); component tests use dates
  relative to the real today instead, since user-event needs real timers.
- Radix submenus open reliably in jsdom with the keyboard (ArrowRight,
  Enter), not with clicks.
- `test/setup.ts` also stubs `ResizeObserver` and `scrollIntoView` for
  cmdk, and raises Testing Library's `asyncUtilTimeout` to 3 s: the
  lazy-loaded due-date picker sometimes took over the 1 s default to load
  when the whole suite ran in parallel, which made a SmartViews test flaky
  (on `main` too).
- `user-event`'s `setup()` installs a clipboard, so tests can read what
  `copyText` wrote with `navigator.clipboard.readText()`.
- UI text uses British spelling ("colour", "Grey"), matching the history
  labels.
- End-to-end tests (M8) live in `e2e/`, run against `vite build` + `vite
preview` (the browser preview, data in localStorage), and use only
  roles and accessible names, like the component tests. Each test gets a
  fresh browser context, so it starts from the seeded starter lists.
  `helpers.ts` has `openApp`, `openList`, `sidebarButton` (sidebar names
  include the count, e.g. "Inbox 2"), `row`, `taskRows`, `addTasks` and
  `expectAccessible` (axe, WCAG 2.1 A/AA plus best practice). Row details
  are asserted through `toHaveAccessibleDescription`. Use
  `ControlOrMeta+…` for shortcuts. `reminders.spec.ts` shows the pattern for
  time: `page.clock.install` before loading, then `clock.fastForward`, with
  `Notification` replaced by a recorder in `addInitScript`.
- Wait for a menu to close (`toBeHidden`) before opening the next one in
  e2e tests; Radix is still tearing the first one down otherwise.
- Dialogs loaded with `lazyWithPreload` (`components/dialogs/lazy.tsx`)
  suspend on their first render in tests. Call `preloadDialogs()` in a
  `beforeAll` in tests that open the palette, Settings or the shortcuts
  dialog.

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
- Outdenting follows Todoist: the task moves to just after its old parent,
  and the siblings below it stay where they were.
- Today counts a task as overdue only from the day after it's due; a task
  due earlier today with a passed time stays under Today, shown in red.
  Upcoming shows only days with tasks, not empty days.
- Clearing a due date also removes the repeat, since a repeat counts from
  the due date.
- Today has a "Move to today" button for overdue tasks (not in the plan).
- The reminder inbox is a Reminders view in the sidebar, which also lists
  the reminders still to come.
- All-day tasks get their own presets (on the day, 1 or 2 days, 1 week
  before, at the all-day time) instead of minute offsets. A custom reminder
  is a fixed moment and works on undated tasks too.
- A reminder that's already in the past when it's added, or that an edit
  moves into the past, is skipped rather than fired. Only reminders whose
  time passes while scheduled (or while the app is closed) go off.
- Missed reminders get a toast and one summary notification, not one
  notification each.
- Settings are a dialog (⌘,/Ctrl+,) rather than only the sidebar menu.
- Duplicating a list doesn't copy reminders, so the copy doesn't notify
  twice.
- Grocery items have no details panel; the quantity and category are
  edited on the row.
- Dragging a grocery item into another category's items changes its
  category (the plan only asked for reordering within a category).
- Uncheck all and Clear checked sit on the "In cart" header and in the
  list's "…" menu, and only when something is in the cart.
- Quantities are always read from grocery quick-add; the "Read dates in
  new tasks" setting doesn't turn that off.
- The cart lists items most recently checked first.
- The editor has its own undo while it has focus (the app's ⌘Z is ignored
  in text fields). The app's undo still covers note edits from outside,
  one burst of typing per step.
- Task notes get the same editor with a smaller toolbar (every Markdown
  shortcut still works there).
- Links have no keyboard shortcut: ⌘K is kept for the command palette
  (M7). Use the toolbar, paste a link over selected text, or type the
  address.
- The Welcome note mentions the note shortcuts, and since M7 ⌘K and ⌘/.
- Import replaces everything; there's no merge. The desktop app saves a
  `before-import` backup first, and the confirmation says what the file
  holds.
- Exports include the Trash and deleted items (it's a full copy); the
  Markdown export leaves them out.
- The Markdown export writes into a new dated folder inside the folder
  you pick. The browser preview downloads one combined file instead.
- Due dates in Markdown are `YYYY-MM-DD HH:mm`, which don't go stale the
  way "Tomorrow" would.
- ⌘F opens the palette too (the desktop webview has no find bar).
- Search results ignore the Completed/cart state for filtering (finished
  items show, ranked lower) rather than hiding them.

- Leaving a to-do list from the keyboard is F6 (to the next region), not a
  change to Tab, which keeps indenting as in Todoist and Things. Shift+F10
  opens any row's menu.
- Dark mode text on the accent and danger fills is dark, not white, for
  contrast.

## Known gaps

From M8:

- Accessibility was checked with axe in Chromium and by keyboard in the e2e
  tests, not with a real screen reader. VoiceOver on macOS and NVDA on
  Windows are worth a pass, especially the row descriptions and the drag
  handles.
- Sidebar rows' names include their count ("Inbox 2"), read as is.
- The e2e tests cover the browser preview only. The desktop build was run
  on Linux under Xvfb (it starts, creates and seeds `checklist.db`, writes
  the daily backup), which exercises the Rust side and SQLite, but not on
  macOS or Windows. Driving the desktop app itself in tests would need
  `tauri-driver` (WebDriver; Linux and Windows only).
- macOS builds are ad-hoc signed (`signingIdentity: "-"`) so Apple silicon
  accepts the universal binary, but they're not notarised: the first launch
  still needs **Open Anyway** (see the README).

From M7:

- The palette searches from the first letter, and a one-letter query on a
  very large data set (20,000 items) takes about 70 ms per keystroke in
  tests. Fine for normal use; a minimum length or an index would help if
  it ever isn't.
- Search is word-based substring matching, not fuzzy: typos don't match.
- No "restore from backup" command; use Import with a file from Show
  backups.
- Pre-import backups count toward the 14 kept, so many imports in one day
  can push out older daily backups.
- The export, import and backups were checked in the browser preview
  (export and re-import round trip in Chromium) and in unit tests, but
  the native dialogs and the backups folder only in code, since this
  environment can't run the desktop app. Check them in `npm run app:dev`.
- Shortcuts are fixed; they can't be changed in Settings.
- ⌘D and ⌘N may clash with a browser's bookmark and new-window shortcuts in
  the browser preview (not in the desktop app).
- ~~The main chunk is now 700 kB (cmdk and the palette).~~ Split in M8.

From M6:

- The editor's own undo history doesn't know about outside changes (the
  app's undo while the editor isn't focused). Pressing ⌘Z in the editor
  afterwards undoes its own earlier steps mapped over that change, which
  can be surprising.
- No images, tables, text colour or highlight (images are out of scope for
  v1). Underline has no Markdown form, so Markdown export drops it.
- Links show no hover preview; the toolbar's link popover has Open and
  Remove. Opening links in the desktop app was checked in code only (the
  opener plugin's default scope allows http, https and mailto). Check it
  in `npm run app:dev`.
- Every keystroke writes the whole note (JSON and plain text) through the
  150 ms save debounce. Fine for notes of normal size; revisit if large
  notes feel slow.
- Enter in a note's title doesn't move focus into the note.

From M5:

- A drag from above can't make an item the first of the next category
  (dropping on that first item puts it after it, as dnd-kit's sortable
  does). Use Alt+↑ afterwards. Categories with no open items aren't
  shown, so they can't be dropped into; use the Category menu.
- Adding a name that's already on the list adds a second item rather than
  merging or unchecking the first.
- The keyword table is English only. Quick-add learns from what the user
  files items under, which covers other languages over time.
- Settings aren't in undo history, so removing a category can't be undone.
  Its items move to Other and stay filed under the old id, so Restore
  defaults puts them back for the default categories.
- The main chunk is now 656 kB.
- Fixed in passing: task text fields were never narrower than the
  browser's default input width (about 170 px), so clicking just right of a
  short task started editing instead of selecting the row. They now size
  to their text (`size={1}`).

From M2:

- ~~Tab inside a list indents, so keyboard users can't Tab out of it.~~ M8
  added F6/Shift+F6 to move between the sidebar, the list and the details.
- Row-mode Space/Delete only work while the row has focus; after clicking
  a toolbar button, click the row again.
- The production bundle went over Vite's 500 kB warning in M2 (476 kB
  before), mostly chrono-node, which quick-add now pulls in. After M3 the
  main chunk is 614 kB, with the due-date picker split out (54 kB). After
  M6 it's 657 kB; TipTap loads separately (404 kB) the first time a note
  or task notes are shown. ~~Consider more code-splitting.~~ Done in M8
  (452 kB).

From M4:

- Desktop notifications can't be clicked to open the task, and have no
  Snooze or Complete buttons: the notification plugin doesn't support
  actions on desktop. Both live in the Reminders view.
- ~~Task rows don't show that a task has a reminder.~~ Done in M8: a bell.
- After the computer sleeps through several reminders, they all fire on
  wake.
- The native side (notifications, tray tooltip, close to tray, launch at
  login, the quit handshake) was checked in code and `cargo test`/`clippy`
  only, since this environment can't run the desktop app. Check it in
  `npm run app:dev`, including the macOS notification permission prompt.

From M3:

- ~~There's no "skip this occurrence" for repeating tasks; set the next date
  in the picker instead.~~ Done: "Skip this time" in the Due date menu and
  the details panel.
- ~~The due date on a row isn't clickable; change it from the row menu or
  the details panel.~~ Done: it opens the due-date picker.
- Today/Upcoming order tasks from different lists by list `sortKey`, which
  only matches the sidebar within one folder.
- ~~No keyboard shortcut opens the due-date picker yet.~~ Done in M7: ⌘D/Ctrl+D.

From M1:

- ~~Folders have no "…" button.~~ Done in M8, and Shift+F10 opens any
  right-click menu.
- The native window theme and macOS drag strip were checked in code only;
  the browser preview can't show them. Check them in `npm run app:dev`.

## Next: checking v1 on macOS and Windows

Everything in the plan is built. Before tagging 1.0 (bump the version in
`package.json`, push a `v1.0.0` tag, then publish the draft release):

- Install the build artifacts on a Mac (Apple silicon and Intel) and a
  Windows PC, and go through the native paths flagged "checked in code
  only" above: notifications (and the macOS permission prompt), the tray
  and its tooltip, close to tray, launch at login, the quit handshake,
  links opening in the browser, the save/open dialogs, Show backups, the
  window theme and the macOS drag strip.
- A screen reader pass (VoiceOver, NVDA).

After v1, the plan's "Not in v1" list is the backlog: sync, a quick-capture
hotkey, templates, tags, and web or mobile builds.
