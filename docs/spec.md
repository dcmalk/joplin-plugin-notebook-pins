# Technical Specification: Notebook Pins Plugin

## 1. Purpose

Define the implementation details for a Joplin plugin that supports pinned notes scoped to the active notebook.
This spec converts `prd.md` into concrete technical behavior for MVP (`v1`) and near-term follow-up (`v1.1`).

## 2. Scope

### In Scope (`v1`)

- Pin/unpin notes in a specific notebook.
- Show only pins for the currently selected notebook in a plugin panel.
- Open pinned notes from the panel.
- Persist pins across app restarts.
- Remove invalid pins when notes are deleted or inaccessible.

### Deferred (`v1.1+`)

- Drag-and-drop reorder in panel.
- Auto-migrate pin when note moves to another notebook (optional setting).
- Search/filter inside pinned panel.

### Out of Scope

- Any modification of native Joplin Notes List behavior.
- Cross-notebook bulk pin management UI.
- Guaranteed mobile feature parity.

## 3. Architecture

Plugin modules:

- `src/index.ts`: plugin bootstrap, registration, lifecycle wiring.
- `src/storage.ts`: load/save/migrate/sanitize pin state.
- `src/pins-service.ts`: pin/unpin/open/list operations and business rules.
- `src/panel.ts`: panel creation, render payload generation, webview messaging.
- `src/events.ts`: workspace/data event subscriptions and debounced refresh.
- `src/commands.ts`: command registration and menu integration.

Core principle:

- Storage is the source of truth.
- UI is a projection of storage + active notebook context.

## 4. Data Model and Persistence

Persist plugin state as JSON in plugin settings.

Setting key:

- `notebookPins.state`

Schema (`v1`):

```json
{
  "version": 1,
  "pinsByFolderId": {
    "FOLDER_ID_1": ["NOTE_ID_A", "NOTE_ID_B"]
  },
  "noteToFolderIndex": {
    "NOTE_ID_A": "FOLDER_ID_1"
  },
  "updatedAt": 1739200000000
}
```

Rules and invariants:

- A folder pin list is ordered and deduplicated.
- `noteToFolderIndex[noteId]` must match folder membership in `pinsByFolderId`.
- A note can exist in at most one folder pin list in `v1`.
- Empty folder lists are removed during save/sanitize.
- Unknown fields are ignored to allow forward compatibility.

Migration behavior:

- If no state exists: initialize empty `version: 1` state.
- If legacy shape exists without `version`: attempt migration to `version: 1`.
- If version is unsupported: fail safely (do not mutate), show non-blocking error in panel/log.

## 5. Commands and Menu Behavior

Registered commands (`v1`):

- `notebookPins.pinInCurrentNotebook`
- `notebookPins.unpinFromCurrentNotebook`
- `notebookPins.openPinnedNote` (internal helper command with note id argument)

Menu integration:

- Add to `NoteListContextMenu`:
  - `Pin in this notebook`
  - `Unpin from this notebook`

Command behavior:

- Pin:
  - Resolve selected note and active notebook.
  - Enforce that note belongs to active notebook; otherwise return user-facing message.
  - If already pinned in active notebook: no-op with message.
  - Append note id to end of folder list.
  - Update `noteToFolderIndex`.
- Unpin:
  - Resolve selected note and active notebook.
  - Remove from active folder list if present.
  - Remove index entry for note if it points to active folder.

## 6. Panel UX and Message Contract

Panel title format:

- `Pinned in "{NotebookName}"`

Empty states:

- No notebook selected: `Select a notebook to view pinned notes.`
- Notebook selected with zero pins: `Right-click a note -> Pin in this notebook.`

List item fields (`v1`):

- Note title
- Optional todo indicator (`is_todo`)

Webview action events to host:

- `OPEN_NOTE` with `{ noteId }`
- `UNPIN_NOTE` with `{ noteId }`
- `REORDER_PINS` with `{ noteIdsInOrder }` (defined now, implemented in `v1.1`)

Render payload host to webview:

```json
{
  "folderId": "FOLDER_ID_1",
  "folderName": "Projects",
  "pins": [
    {
      "noteId": "NOTE_ID_A",
      "title": "Index",
      "isTodo": false,
      "todoCompleted": false
    }
  ],
  "capabilities": {
    "reorder": false
  }
}
```

## 7. Event Flow and Refresh Strategy

Startup sequence:

1. Register settings, commands, and context menu items.
2. Create panel and bind webview message handler.
3. Load and sanitize persisted state.
4. Render panel for current notebook context.

Refresh triggers:

- Notebook selection changes.
- Pin/unpin operations complete.
- Note metadata changes for pinned notes (title, todo state, deletion, move).

Debounce policy:

- Use a trailing debounce (`150ms`) for non-user-initiated background refreshes.
- User actions (pin/unpin/open) trigger immediate refresh.

Performance target:

- Panel updates to new notebook context within `500ms` under normal local conditions.

## 8. Data Integrity and Edge Cases

Deleted note:

- If note no longer exists, remove it from pin state on next refresh/sanitize.

Notebook rename:

- No state migration required because folder IDs are stable.

Note moved to another notebook:

- `v1` default: remove stale pin entry from previous folder.
- `v1.1` optional setting `autoMigrateOnMove`:
  - if enabled, remove from old folder and append to new folder list.

Missing notebook:

- If folder id in state is missing, keep data but skip rendering until folder exists again.

Corrupt state JSON:

- Reset to empty in-memory state, preserve raw value for diagnostic logging if available, and continue with non-blocking behavior.

## 9. Settings

`v1` settings:

- `notebookPins.maxPinsPerNotebook` (integer, default `0`, where `0` means unlimited)

`v1.1` settings (planned):

- `notebookPins.autoMigrateOnMove` (boolean, default `false`)

Setting enforcement:

- On pin action, if max is non-zero and folder list is at limit, reject pin with user-visible message.

## 10. Testing Plan

Unit tests:

- Storage init, migration, sanitize, dedupe, invariant repair.
- Pin/unpin business rules and max-pin enforcement.
- Move/delete handling for pinned notes.

Integration tests (mocked Joplin API):

- Notebook switch rerenders correct pin list.
- Panel action events call expected commands/service methods.
- Persistence reload reproduces previous state.

Manual QA checklist:

- Desktop (Windows) primary target:
  - Pin/unpin from note context menu.
  - Panel updates when switching notebooks.
  - Click pinned note opens correct note.
  - Deleted pinned note disappears after refresh.
- Android best-effort:
  - Panel loads.
  - Open pinned note works.

## 11. Implementation Milestones

### Milestone A (`v1` foundation)

- State schema + storage module
- Pin/unpin commands + context menu actions
- Panel render + open-note action
- Refresh wiring + sanitize pass

### Milestone B (`v1` hardening)

- Max-pins setting enforcement
- Error handling and user feedback polish
- Unit + integration tests for core flows

### Milestone C (`v1.1`)

- Reorder support in UI + persisted order updates
- Optional auto-migrate on move

## 12. Open Decisions

- Confirm exact user-facing messaging API for command no-op/error feedback.
- Confirm final panel layout constraints for small/mobile widths.
- Decide whether `v1` should include reorder now or strictly defer to `v1.1` (current spec defers).
