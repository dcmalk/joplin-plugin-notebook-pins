# Repository Guidelines

## Project Structure & Module Organization
This repository is currently specification-first:
- `prd.md`: product requirements and scope.
- `spec.md`: implementation-level technical decisions.

When code is added, follow the structure defined in `spec.md`:
- `src/index.ts` (bootstrap/lifecycle)
- `src/storage.ts`, `src/pins-service.ts`, `src/commands.ts`, `src/events.ts`, `src/panel.ts`
- `tests/unit/*` and `tests/integration/*` for automated tests

Keep files focused by responsibility; avoid large multi-purpose modules.

## Build, Test, and Development Commands
No build/test scripts are committed yet. When scaffolding, standardize on npm scripts:
- `npm run build` - compile plugin source.
- `npm run dev` - watch mode for local iteration.
- `npm test` - run all tests.
- `npm run lint` - static checks.

If you introduce tooling, update this section and `package.json` in the same PR.

## Coding Style & Naming Conventions
- Language: TypeScript for plugin code.
- Indentation: 2 spaces; keep lines readable and avoid deeply nested logic.
- Naming: `kebab-case` for file names, `camelCase` for variables/functions, `PascalCase` for types/classes.
- Prefer small pure functions in service/storage modules.
- Use a formatter/linter (Prettier + ESLint recommended) and commit only clean output.

## Testing Guidelines
- Unit-test storage and pin/unpin business logic.
- Integration-test notebook switching, panel rendering payloads, and command wiring.
- Test file naming: `*.test.ts` (unit) and `*.int.test.ts` (integration).
- Target behavior from `spec.md` acceptance criteria (including notebook-context refresh timing).

## Commit & Pull Request Guidelines
Git history is not initialized in this workspace; use Conventional Commits going forward:
- `feat: add pin command wiring`
- `fix: sanitize deleted note ids`
- `docs: update spec edge cases`

PRs should include:
- clear summary and scope
- linked issue/task (if available)
- test evidence (command output or checklist)
- screenshots/GIFs for panel UI changes

## Security & Configuration Tips
- Do not commit secrets or local Joplin profile data.
- Keep persisted state under the plugin setting key defined in `spec.md` (`notebookPins.state`).
- Validate and sanitize stored JSON before use.
