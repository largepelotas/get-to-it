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
npm test
```

## Installing a build

Every push builds unsigned installers. They're under **Actions → Build
installers → the latest run → Artifacts**.

Because the builds aren't signed, first launch needs one extra step:

- **macOS:** right-click Checklist in Applications and choose **Open**.
- **Windows:** in the SmartScreen prompt, click **More info → Run anyway**.
