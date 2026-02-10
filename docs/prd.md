# PRD --- Notebook‑Aware Favorites ("Pinned notes per notebook")

## Summary

Build a Joplin plugin that lets users "favorite/pin" a small set of
notes **scoped to the currently selected notebook** (folder). The plugin
displays these pins in a dedicated panel that automatically updates as
the user navigates notebooks. This solves "index notes get lost when
sorting by creation date" without title prefix hacks.

------------------------------------------------------------------------

## Problem

Joplin's native Notes List doesn't support "pin to top" within a
notebook. Existing workarounds (prefixing titles, converting to to‑dos)
conflict with workflows like sorting by creation date. The Favorites
plugin is global and not notebook-aware; Note Tabs is not notebook-aware
and changes workflow.

Users with **hundreds of notebooks** need **2--3 "index" notes per
notebook** always visible in that notebook context.

------------------------------------------------------------------------

## Goals

1.  Allow pinning a note **to the current notebook** (folder) with one
    action.\
2.  Show pinned notes **only when the user is in that notebook**.\
3.  Make it quick to open pinned notes (single click/tap).\
4.  Keep it lightweight and reliable for large vaults (hundreds of
    notebooks, thousands of notes).

------------------------------------------------------------------------

## Non‑Goals

-   Modifying or replacing the native Notes List sorting/rendering.\
-   Implementing "sticky notes inside the native note list".\
-   Complex note management features (bulk pin management across all
    notebooks, advanced filtering).\
-   Guaranteed parity with mobile UI/UX across all platforms.

------------------------------------------------------------------------

## Target Users

-   Migrators from Evernote who used "pinned notes" / "shortcuts" per
    notebook.\
-   Power users with many notebooks and "index" notes.\
-   Users who sort notes by created/updated date and don't want title
    hacks.

------------------------------------------------------------------------

## User Stories

1.  **Pin index note in this notebook** -- Right‑click a note and choose
    "Pin in this notebook".\
2.  **See only relevant pinned notes** -- Panel shows only pins for the
    active notebook.\
3.  **Fast open** -- Clicking a pinned note opens it.\
4.  **Unpin** -- Remove a pin with one action.\
5.  **Reorder pins** -- Drag into preferred order.

------------------------------------------------------------------------

## UX / UI

### Panel

-   Title: **Pinned in "{NotebookName}"**\
-   List of pinned notes (title + optional to‑do icon)\
-   Empty state with hint: "Right‑click a note → Pin in this notebook."

### Actions (Desktop)

-   In **NoteListContextMenu**
    -   "📌 Pin in this notebook"\
    -   "Unpin from this notebook"\
-   Optional command for the currently open note.

### Reordering

-   Drag‑and‑drop within the panel.

------------------------------------------------------------------------

## Functional Requirements

### Core

1.  **Notebook‑aware storage** -- pins stored by folder ID.\
2.  **Automatic context switching** -- update when notebook changes.\
3.  **Open note from panel**.\
4.  **Pin/Unpin from note list**.\
5.  **Resilience** to rename, delete, and sync changes.

### Nice‑to‑Have

-   Max pins per notebook setting\
-   Auto‑migrate when a pinned note is moved\
-   Search/filter inside pinned panel

------------------------------------------------------------------------

## Data Model

``` json
{
  "pinsByFolderId": {
    "FOLDER_ID_1": ["NOTE_ID_A", "NOTE_ID_B"]
  },
  "noteToFolderIndex": {
    "NOTE_ID_A": "FOLDER_ID_1"
  }
}
```

------------------------------------------------------------------------

## Technical Approach

### Platform / Language

-   Plugins written in **TypeScript/JavaScript** using Joplin Plugin
    API.

### Key APIs

-   `joplin.views.panels` -- create panel\
-   `joplin.workspace` -- detect notebook changes\
-   `joplin.data` -- fetch note metadata\
-   `joplin.commands` -- open notes and actions

### Event Flow

1.  On start: register panel, commands, menus\
2.  On notebook change: load pins for folder\
3.  On pin/unpin: update storage and re‑render\
4.  On note change: debounced refresh

### Performance

-   Debounced updates\
-   Cache titles\
-   Only fetch pinned IDs

------------------------------------------------------------------------

## Edge Cases

-   Deleted notes auto‑removed\
-   Notebook rename safe (IDs stable)\
-   Optional auto‑migrate on move

------------------------------------------------------------------------

## Mobile Feasibility

### Android

-   Modern Joplin Android builds support plugins.\
-   Panel‑based plugin should work if designed responsively.

### iOS

-   App Store build only allows **Recommended plugins**.\
-   Workaround: use Joplin Web/PWA on iOS to load custom plugins.

### Mobile UX Notes

-   Compact panel layout\
-   Touch‑friendly reorder controls

------------------------------------------------------------------------

## Release Plan

### V1 -- MVP

-   Panel + pin/unpin\
-   Click to open\
-   Persistence

### V1.1 -- Polish

-   Drag reorder\
-   Auto‑migrate option

### V1.2 -- Mobile

-   Touch reorder\
-   Android testing

------------------------------------------------------------------------

## Acceptance Criteria

-   Panel updates per notebook within 500ms\
-   Pins persist across restarts\
-   Deleted notes cleaned\
-   Works on Windows desktop; Android best‑effort

------------------------------------------------------------------------

## Risks

-   Plugin settings not synced across devices\
-   Mobile UI constraints\
-   Context menu differences on mobile
