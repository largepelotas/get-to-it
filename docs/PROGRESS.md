# Progress and handoff notes

Read this with [PLAN.md](PLAN.md) before starting the next milestone. Work
happens one milestone per chat; update this file at the end of each one.

## Status

| #     | Milestone     | State                                                                  |
| ----- | ------------- | ---------------------------------------------------------------------- |
| M0    | Project setup | **Done**                                                               |
| M1    | App frame     | **Done**                                                               |
| M2    | To-do lists   | **Done**                                                               |
| M3    | Due dates     | **Done**                                                               |
| M4    | Reminders     | **Done**                                                               |
| M5    | Grocery lists | **Done**                                                               |
| M6    | Notes         | Next (see the end of this file).                                       |
| M7–M8 |               | Not started. Several pure helpers they need already exist (see below). |

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
- `data/repository.ts`: the `Repository` interface (`load`, `write(ops)`).
  Adapters:
  - `sqlite.ts`: column mapping plus migrations tracked with
    `PRAGMA user_version`. Hard deletes write a `tombstones` row.
  - `localStorage.ts`: browser preview.
  - `memory.ts`: tests.
- `platform/index.ts`: `isTauri`, `isMac`, `createRepository()`, `appReady()`,
  `setWindowTheme`, and since M4 `setReminderSchedule`, `onReminderFired`,
  `requestNotificationPermission`, `notify`, `setCloseToTray`,
  `getLaunchAtLogin` (null in the browser), `setLaunchAtLogin`,
  `onQuitRequested`, `quitApp` and `setTrayTooltip`. Native events go
  through `listenNative`, which returns an unsubscribe function right away.
  Put every other native call here too, with a browser fallback.
  - `browserScheduler.ts`: the browser preview's copy of the native
    scheduler (1 s tick, the Notification API, the same resend rule).
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
    `after`: an id, `null` for first, left out for last; grocery items also
    pass `quantity` and `category`),
    `createItemFromText` (runs `parseQuickAdd` when `settings.parseDates`;
    an optional `defaultDue` is used when the text has no date),
    `setItemText` and `setItemNotes` (coalesced per item; blank text is
    ignored), `setChecked` (checking a parent checks its open subtasks;
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
  list, else Today).
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
  and `useAppShortcuts` (undo ⌘Z/Ctrl+Z, redo ⌘⇧Z/Ctrl+Shift+Z/Ctrl+Y,
  ignored in text fields; ⌘,/Ctrl+, opens Settings from anywhere). Add new
  global shortcuts there.

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
  entries for archived and trashed lists; grocery lists also get Uncheck
  all and Clear checked, disabled while the cart is empty).

### Screens

- `components/sidebar/`: `Sidebar` (Today, Upcoming, Reminders with the
  inbox count, Pinned, Lists tree, Archive, Trash, New list, settings menu
  with the theme and "Settings…", and a warning icon when saving fails), `ListTree` (dnd-kit; pointer drag after 5 px,
  keyboard drag with Space so Enter still opens a row; a dragged folder
  hides its lists), `SidebarItem`, `RenameField` (double-click a list or
  use Rename).
- `components/views/`: `ListView` (editable title, "…" menu, banners for
  archived or trashed lists; a to-do list gets `TodoList` and the details
  panel; a grocery list gets `GroceryList`; notes show a read-only
  `RichTextPreview`), `SmartViews` (`TodayView`: Overdue with "Move to
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
    `DuePicker` popover plus a clear button, priority, plain-text notes
    stored as a TipTap doc, subtasks with "Add subtask", completion
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
  theme, week start, reading dates in new tasks, the all-day reminder
  time, close to tray, open at login (read from and written to the
  autostart plugin, not stored in settings; disabled in the browser) and
  the grocery categories (`GroceryCategoriesEditor`: rename, reorder with
  arrow buttons, remove (not the last one), add, and Restore defaults).
  The dialog body scrolls.
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
  end). `test/setup.ts` cleans up between tests and stubs pointer capture,
  which jsdom lacks and sonner's toasts call (without it Vitest reported an
  unhandled error and exited non-zero, even with every test passing).
- Date-dependent unit tests fake only `Date`
  (`vi.useFakeTimers({ toFake: ['Date'] })`); component tests use dates
  relative to the real today instead, since user-event needs real timers.
- Radix submenus open reliably in jsdom with the keyboard (ArrowRight,
  Enter), not with clicks.
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

## Known gaps

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

- Tab inside a list indents, so keyboard users leave the list by pressing
  Escape until the selection clears (focus goes to the list container),
  then Tab. Revisit in M8.
- Row-mode Space/Delete only work while the row has focus; after clicking
  a toolbar button, click the row again.
- The production bundle went over Vite's 500 kB warning in M2 (476 kB
  before), mostly chrono-node, which quick-add now pulls in. After M3 the
  main chunk is 614 kB, with the due-date picker split out (54 kB). TipTap
  will add more in M6. Consider more code-splitting in M8.

From M4:

- Desktop notifications can't be clicked to open the task, and have no
  Snooze or Complete buttons: the notification plugin doesn't support
  actions on desktop. Both live in the Reminders view.
- Task rows don't show that a task has a reminder; only the details panel
  and the Reminders view do.
- After the computer sleeps through several reminders, they all fire on
  wake.
- The native side (notifications, tray tooltip, close to tray, launch at
  login, the quit handshake) was checked in code and `cargo test`/`clippy`
  only, since this environment can't run the desktop app. Check it in
  `npm run app:dev`, including the macOS notification permission prompt.

From M3:

- There's no "skip this occurrence" for repeating tasks; set the next date
  in the picker instead.
- The due date on a row isn't clickable; change it from the row menu or
  the details panel.
- Today/Upcoming order tasks from different lists by list `sortKey`, which
  only matches the sidebar within one folder.
- No keyboard shortcut opens the due-date picker yet (M7).

From M1:

- Folders have no "…" button, so their menu is right-click only (lists have
  one in the header). Revisit in the M8 accessibility pass.
- The native window theme and macOS drag strip were checked in code only;
  the browser preview can't show them. Check them in `npm run app:dev`.

## Next: M6 (rich-text notes)

The TipTap packages are installed (`@tiptap/react`, `starter-kit`,
`extension-list`, `extensions`). Note lists already get a `notes` row when
created (`insertList`) and duplicated, and `ListView` shows it read-only
with `RichTextPreview`. `lib/richText.ts` has the doc helpers
(`parseDoc`, `docToPlainText`, `docToMarkdown`, `docFromText`,
`isDocEmpty`). Task notes (`Item.details`) are TipTap docs too, edited as
plain text in `ItemDetails` for now.

1. A `setNoteContent(listId, doc)` action: stores the JSON and
   `plainText` (for search in M7), coalesced per note so typing is one
   undo step at a time.
2. `NoteEditor`: TipTap with StarterKit (headings, bold, italic, strike,
   code, lists, quotes, code blocks, dividers), underline, task lists and
   links, Markdown-style input rules, and a toolbar. Read-only for
   archived or trashed lists. Lazy-load it like `DuePicker`, since TipTap
   is large.
3. Links open in the default browser (`@tauri-apps/plugin-opener` in
   the app; a new tab in the browser preview), through `platform`.
4. Swap the plain-text notes field in `ItemDetails` for a compact version
   of the editor (no migration needed).
5. Tests: the action (coalescing, plain text), and a component test that
   types into a note and checks what's stored. TipTap needs a few DOM APIs
   jsdom lacks (e.g. `getClientRects`, `elementFromPoint`); stub them in
   `test/setup.ts` if needed.
