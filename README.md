# Joplin Notebook Pins

**Notebook-aware pinned notes for Joplin.**

Pin a few notes per notebook so they're always one click away. Pins are scoped to each notebook and shown in a compact panel that updates when you switch notebooks.

No title hacks (`!Index`), no global sort changes, no note modifications.

## Usage

1.  Right-click a note in the note list and select **"Pin in this notebook"**.
2.  Click a pinned note in the panel to open it.
3.  Drag to reorder. Right-click (or use the command palette) to unpin.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Max pins per notebook | `0` (unlimited) | Cap the number of pins per notebook. |
| Auto-migrate on move | Off | Keep a note pinned when it moves to another notebook. |
| Show horizontal scrollbar | Off | Show/hide the strip scrollbar (scrolling still works either way). |

Deleted or trashed notes are unpinned automatically.

---

## Development

Requires Node.js 20+ and npm.

```bash
npm install
npm run typecheck   # type-check only
npm test            # unit + integration tests
npm run build       # produces index.js and dist/panel-webview.js
```

### Loading in Joplin (dev mode)

1. Run `npm run build`.
2. In Joplin Desktop, go to plugin advanced settings and set the development plugin path to this repository.
3. Restart Joplin.

### Packaging (.jpl)

```powershell
npm run build
New-Item -ItemType Directory -Path .\release -Force | Out-Null
tar -cf .\release\notebook-pins.jpl manifest.json index.js dist README.md
```

Then install via **Tools > Options > Plugins > Install from file**.

## Roadmap

- [x] **v1.0 (MVP):** Core pinning, panel UI, persistence.
- [x] **v1.1:** Drag-and-drop reordering, auto-migration, and scrollbar preference.
