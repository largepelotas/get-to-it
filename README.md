# Checklist

A desktop app for macOS and Windows for to-do lists, grocery lists and
rich-text notes. It's built with Tauri 2, React and TypeScript, and keeps
data in a local SQLite database.

- [Plan](docs/PLAN.md): decisions, features and milestones
- [Progress](docs/PROGRESS.md): what's built so far and how it fits together

## Development

```sh
npm install
npm run dev        # browser preview at http://localhost:1420
npm run app:dev    # desktop app (needs Rust)
npm test           # unit tests
npm run test:e2e   # end-to-end tests (first: npx playwright install chromium)
```

## Installing a build

Every push builds unsigned installers. They're under **Actions → Build
installers → the latest run → Artifacts**. Tagged versions (`v1.0.0`) also
get a draft release with the installers attached.

Because the builds aren't signed with a developer certificate, first launch
needs one extra step:

- **macOS:** open Checklist once (it will be blocked), then go to **System
  Settings → Privacy & Security** and click **Open Anyway** next to the
  message about Checklist. On macOS 14 and earlier, right-clicking the app
  in Applications and choosing **Open** also works.
- **Windows:** in the SmartScreen prompt, click **More info → Run anyway**.
