# Implementation Task List

## Milestone A (`v1` foundation)

- [x] Scaffold TypeScript plugin project (`package.json`, `tsconfig.json`, `manifest.json`).
- [x] Implement state storage with schema sanitize/migration behavior (`src/storage.ts`).
- [x] Implement pin/unpin/list/open business logic (`src/pins-service.ts`).
- [x] Implement panel rendering and webview message handling (`src/panel.ts`).
- [x] Register commands and note list context menu actions (`src/commands.ts`).
- [x] Wire workspace event refresh + note-change cleanup (`src/events.ts`).
- [x] Compose startup flow and runtime behavior in plugin entrypoint (`src/index.ts`).

## Milestone B (`v1` hardening)

- [x] Add max-pins-per-notebook setting and enforcement.
- [x] Add baseline unit tests for storage and service logic.
- [ ] Add integration tests with mocked Joplin API wiring.
- [ ] Add manual QA pass in Joplin desktop (Windows target).

## Milestone C (`v1.1`)

- [ ] Implement drag reorder in panel and persisted order updates.
- [ ] Add optional auto-migrate behavior for moved notes.
- [ ] Add mobile-specific interaction polish and Android validation.
