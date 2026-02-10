# Joplin Notebook Pins Plugin

Notebook-aware pinned notes for Joplin.  
This plugin keeps important notes visible per notebook (for example, index notes) without renaming titles or changing note sort order.

## Current Status

- `v1` core is implemented:
  - Pin/unpin notes in the current notebook
  - Notebook-scoped panel rendering
  - Click-to-open from panel
  - Persistent state and stale pin cleanup
- `v1.1` planned:
  - Drag reorder
  - Optional auto-migrate on note move

See `docs/prd.md`, `docs/spec.md`, and `docs/implementation-tasks.md` for details.

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

## Using in Joplin (Development)

This repository is currently intended for development loading.

1. Build the plugin (`npm run build`).
2. In Joplin Desktop, open plugin advanced settings and set the development plugin path to this repository.
3. Restart Joplin and enable the plugin.

## Project Structure

- `src/` plugin runtime code
- `tests/unit/` unit tests
- `tests/integration/` wiring/integration tests with mocks
- `docs/` product and technical documentation

## Contributing

- Follow `AGENTS.md` for repository conventions.
- Use Conventional Commits (`feat: ...`, `fix: ...`, `docs: ...`).
- Include test evidence in pull requests.
