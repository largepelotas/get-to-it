# Checklist — v1 plan

A desktop app (macOS and Windows) for to-do lists, grocery lists and rich-text
notes. Built for work use first, with a design that can later move to web and
mobile.

## Decisions

| Topic | Decision |
|---|---|
| Platform | Desktop app with **Tauri 2**. The UI is React, so it can be reused for web or mobile builds later. |
| Operating systems | macOS (Apple silicon + Intel) and Windows |
| Audience | A single user for now: unsigned builds, no auto-update |
| Data | Stored on the computer in SQLite. Built so sync can be added later without a rewrite. |
| Structure | Each list is one type: to-do, grocery or note |
| v1 extras | Due dates, reminders, recurring tasks, subtasks with task details, folders |
| Grouping | Folders (one folder per list, shown in the sidebar). Tags may come later. |

## Stack

- **Shell:** Tauri 2 with the official plugins for SQLite, notifications,
  launch at login, window state, dialogs, opening links and the clipboard. The
  tray icon is built into Tauri.
- **UI:** React, TypeScript and Vite.
- **Styling:** Tailwind v4 over CSS custom properties (design tokens). Radix UI
  primitives for menus, dialogs, popovers and tooltips. Lucide icons.
- **Rich text:** TipTap, for notes and task details.
- **Other libraries:** dnd-kit (drag-and-drop), cmdk (command palette),
  chrono-node (typed dates), date-fns (date maths), react-day-picker
  (calendar), fractional-indexing (sort keys), sonner (toasts).
- **State:** Zustand. All data is loaded into memory at startup, and every
  change is written through to the storage layer.
- **Storage layer:** one `Repository` interface. The desktop app uses SQLite;
  the browser preview uses localStorage; tests use an in-memory version. A web,
  mobile or sync version plugs in the same way later.

## Data model

```
Folder     { id, name, color?, sortKey, collapsed, createdAt, updatedAt, deletedAt? }
List       { id, folderId?, type: todo|grocery|note, title, color?, pinned, sortKey,
             showCompleted, archivedAt?, deletedAt?, createdAt, updatedAt }
Item       { id, listId, parentId? /*subtask*/, text, checked, completedAt?, sortKey,
             details? /*rich text JSON*/, dueDate? /*YYYY-MM-DD*/, dueTime? /*HH:mm*/,
             priority /*0 none, 1-3*/, recurrence? /*JSON rule*/,
             quantity?, category? /*grocery*/, createdAt, updatedAt, deletedAt? }
Reminder   { id, itemId, kind: relative|absolute, offsetMinutes?, at?,
             firedFor?, snoozedUntil?, createdAt, updatedAt }
Completion { id, itemId, dueDate?, completedAt }   /* history of recurring tasks */
Note       { listId, content /*rich text JSON*/, plainText, updatedAt }
```

- IDs are ULIDs, which sort by creation time.
- Every record has `updatedAt`. Deletes set `deletedAt`, and records only
  disappear when the Trash is emptied. At that point a tombstone row is kept.
  Both make sync possible later.
- Sort order uses fractional-index string keys, so reordering touches one row.
- Due dates are local calendar dates with an optional local time. This avoids
  time-zone drift for all-day tasks.
- Repeat rules are small JSON objects, covering the useful part of iCalendar
  RRULE: daily, weekly on chosen days, monthly, yearly, every N, and either
  "on a schedule" or "N after completion".

## Features

### To-do lists
- Quick-add understands typed dates, repeats and priority, e.g.
  "Review deck tomorrow 3pm", "Standup every weekday 9:30", "Pay invoice p1".
  A preview shows what was understood.
- Subtasks: Tab and Shift+Tab indent and outdent. A parent shows progress like
  2/5, and checking a parent completes its subtasks.
- Drag to reorder. Alt+↑/↓ moves an item.
- Priority P1–P3.
- Finished items go to a collapsible "Completed" section.
- A details panel for the selected task holds the title, rich-text notes, due
  date and time, repeat rule, reminders, priority, subtasks and completion
  history.

### Recurring tasks
- Checking a recurring task moves its due date to the next occurrence, resets
  its subtasks and records the completion.
- Rules: daily, weekdays, weekly on chosen days, monthly, yearly, every N.
- Mode: repeat on a fixed schedule, or come back N days/weeks/months after you
  finish.

### Reminders
- Presets: at the due time, 5/15/30 minutes before, 1 hour before, 1 day
  before, or a custom date and time. For all-day tasks, reminders use a default
  time (09:00, set in Settings).
- A scheduler in the native side fires desktop notifications, so hidden or
  throttled windows don't delay them.
- Closing the window hides it to the tray so reminders keep firing. There's an
  option to launch at login.
- Opening the app lists any reminders it missed.
- Fired reminders appear in an in-app inbox, with Snooze (10 min, 1 hour,
  tomorrow), Complete and Dismiss.

### Smart views
- **Today:** overdue and due-today tasks from every to-do list.
- **Upcoming:** future tasks grouped by day.

### Grocery lists
- Quantity and category per item. Items are grouped by category, from a
  default set you can edit.
- Checked items move to an "In cart" section.
- **Uncheck all** to reuse a list, **Clear checked** to remove bought items.

### Notes
- TipTap editor with a toolbar and Markdown-style shortcuts.
- Headings, bold, italic, underline, strikethrough, inline code, bullet and
  numbered lists, inline checklists, links, quotes, code blocks and dividers.
- Links open in the default browser.

### Everywhere
- Folders, pinning, colors, archive, and a Trash you can restore from.
- Undo and redo for list and item changes.
- ⌘/Ctrl+K command palette that also searches every list, item and note.
- Keyboard shortcuts for everything common.
- Copy any list or note as Markdown.
- JSON export and import, Markdown export, and automatic daily backups.
- Light, dark and system themes.

## Milestones

| # | Scope |
|---|---|
| M0 | Project setup: Tauri, React, TypeScript, linting and formatting, migrations, storage layer, unit tests, CI with macOS and Windows builds |
| M1 | App frame: sidebar, folders, list CRUD, pin/color/archive/trash, design system, dark mode |
| M2 | To-do lists: items, subtasks, drag-and-drop, priority, details panel, undo |
| M3 | Due dates, typed-date parsing, Today and Upcoming views, recurring tasks |
| M4 | Reminders: notifications, tray, launch at login, missed-reminder summary, snooze |
| M5 | Grocery lists |
| M6 | Rich-text notes |
| M7 | Search, command palette, shortcuts, copy as Markdown, export/import, backups |
| M8 | End-to-end tests, accessibility pass, packaging polish |

## Not in v1
Sync and shared lists, a quick-capture hotkey, templates, grocery suggestions,
images in notes, tags, mobile or web builds, code signing and auto-update.
