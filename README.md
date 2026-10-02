# Checklist

A desktop app for macOS and Windows for to-do lists, grocery lists,
habit lists and rich-text notes. It's built with Tauri 2, React and TypeScript, and keeps
data in a local SQLite database.

- [Architecture](docs/ARCHITECTURE.md): how it's built, the decisions behind it and known gaps
- [Todoist and TickTick comparison](docs/todoist-gap.md): what's there, what's missing and what to build next

## Development

```sh
npm install
npm run dev        # browser preview at http://localhost:1420
npm run app:dev    # desktop app (needs Rust)
npm test           # unit tests
npm run test:e2e   # end-to-end tests (first: npx playwright install chromium)
```

In development a new data set starts with sample data (lists, tasks, habits,
notes and a year of history) instead of the starter lists. `npm run app:dev`
keeps its database in a `dev` folder inside the app's data folder, apart from
an installed copy's. The dates are worked out on the day the data is made;
**Reset sample data** in the command palette makes a fresh set.

## Installing a build

Unsigned installers are built for each version tag, or when the **Build
installers** workflow is run by hand. They're under **Actions → Build
installers → the latest run → Artifacts**. Tagged versions (`v1.0.0`) also
get a draft release with the installers attached.

Because the builds aren't signed with a developer certificate, first launch
needs one extra step:

- **macOS:** open Checklist once (it will be blocked), then go to **System
  Settings → Privacy & Security** and click **Open Anyway** next to the
  message about Checklist. On macOS 14 and earlier, right-clicking the app
  in Applications and choosing **Open** also works.
- **Windows:** in the SmartScreen prompt, click **More info → Run anyway**.
