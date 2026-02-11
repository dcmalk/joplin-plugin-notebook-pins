# Joplin Notebook Pins

**Notebook-aware pinned notes for Joplin.**

This plugin solves the problem of keeping key notes (like index notes or project dashboards) accessible within specific notebooks without resorting to "title hacks" (e.g., `!Index`) or changing your global sort order.

## Features

- 📌 **Notebook-Scoped:** Pins are attached to a specific notebook. Switching notebooks automatically refreshes the list.
- ⚡ **Fast Access:** Dedicated side panel for one-click navigation to your most important notes.
- 🧹 **Clean Workflow:** Does not modify your note titles or native note list sorting.
- 💾 **Persistent:** Pins are saved and restored across sessions.

## Usage

1.  **Pin a Note:** Right-click a note in the note list and select **"Pin in this notebook"**.
2.  **Open:** Click any note in the "Notebook Pins" panel to open it immediately.
3.  **Unpin:** Right-click the note again to **"Unpin from this notebook"**, or use the command palette.

---

## Development Setup

Prerequisites:
- Node.js 20+
- npm

Install and validate:

```bash
npm install
npm run typecheck
npm test
```

Build:

```bash
npm run build
```

Expected output:

- `index.js` (Joplin plugin entrypoint)
- `dist/panel-webview.js` (panel webview client script)

## Using in Joplin (Development)

This repository is currently intended for development loading.

1. Build the plugin (`npm run build`) and confirm `index.js` exists.
2. In Joplin Desktop, open plugin advanced settings and set the development plugin path to this repository.
3. Restart Joplin and enable the plugin.

## Packaging (.jpl)

To distribute/install without using a development path, create a `.jpl` package.

1. Build the plugin:

```powershell
npm run build
```

2. Create the package (PowerShell):

```powershell
New-Item -ItemType Directory -Path .\release -Force | Out-Null
tar -cf .\release\com.thirdorbitlabs.notebook-pins-0.1.1-rc.1.jpl manifest.json index.js dist README.md
```

3. Install in Joplin:
 - Open `Tools -> Options -> Plugins`
 - Choose `Install from file`
 - Select the `.jpl` from `.\release`
 - Restart Joplin

## Release Artifacts

- Keep `.jpl` files in `.\release` as local build artifacts during development.
- Do not commit generated `.jpl` files to the main source tree unless you intentionally version binaries.
- Preferred distribution flow: create the `.jpl` locally/CI and attach it to a GitHub Release.

## Contributing

- Follow `AGENTS.md` for repository conventions.
- Use Conventional Commits (`feat: ...`, `fix: ...`, `docs: ...`).
- Include test evidence in pull requests.
- See `docs/` for detailed specifications (`prd.md`, `spec.md`).

## Roadmap

- [x] **v1.0 (MVP):** Core pinning, panel UI, persistence.
- [ ] **v1.1:** Drag-and-drop reordering, auto-migration when notes are moved.
