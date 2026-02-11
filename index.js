"use strict";

// src/commands.ts
var COMMAND_PIN = "notebookPins.pinInCurrentNotebook";
var COMMAND_UNPIN = "notebookPins.unpinFromCurrentNotebook";
var COMMAND_OPEN_PINNED = "notebookPins.openPinnedNote";
var NOTE_LIST_CONTEXT_MENU = "noteListContextMenu";
var registerCommandsAndMenus = async (joplin2, handlers) => {
  await joplin2.commands.register({
    name: COMMAND_PIN,
    label: "Pin in this notebook",
    execute: handlers.onPinSelected
  });
  await joplin2.commands.register({
    name: COMMAND_UNPIN,
    label: "Unpin from this notebook",
    execute: handlers.onUnpinSelected
  });
  await joplin2.commands.register({
    name: COMMAND_OPEN_PINNED,
    label: "Open pinned note",
    execute: async (noteId) => {
      if (typeof noteId !== "string" || noteId.length === 0) return;
      await handlers.onOpenPinned(noteId);
    }
  });
  await joplin2.views.menuItems.create(
    "notebookPins.pinInNotebook.menu",
    COMMAND_PIN,
    NOTE_LIST_CONTEXT_MENU
  );
  await joplin2.views.menuItems.create(
    "notebookPins.unpinFromNotebook.menu",
    COMMAND_UNPIN,
    NOTE_LIST_CONTEXT_MENU
  );
};

// src/events.ts
var debounce = (callback, waitMs) => {
  let timeout = null;
  return () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(callback, waitMs);
  };
};
var registerWorkspaceEvents = async (joplin2, handlers) => {
  const debouncedRefresh = debounce(() => {
    void handlers.refresh();
  }, 150);
  await joplin2.workspace.onNoteSelectionChange(async () => {
    debouncedRefresh();
  });
  if (typeof joplin2.workspace.onFolderSelectionChange === "function") {
    await joplin2.workspace.onFolderSelectionChange(async () => {
      await handlers.refresh();
    });
  }
  if (typeof joplin2.workspace.onNoteChange === "function") {
    await joplin2.workspace.onNoteChange(async (event) => {
      if (event && typeof event.id === "string") {
        await handlers.handleNoteChange(event.id);
      }
      debouncedRefresh();
    });
  }
  if (typeof joplin2.workspace.onSyncComplete === "function") {
    await joplin2.workspace.onSyncComplete(async () => {
      debouncedRefresh();
    });
  }
};

// src/storage.ts
var STATE_SETTING_KEY = "notebookPins.state";
var MAX_PINS_SETTING_KEY = "notebookPins.maxPinsPerNotebook";
var STATE_VERSION = 1;
var createEmptyState = (now = Date.now()) => ({
  version: STATE_VERSION,
  pinsByFolderId: {},
  noteToFolderIndex: {},
  updatedAt: now
});
var isRecord = (value) => typeof value === "object" && value !== null;
var isValidId = (value) => typeof value === "string" && value.trim().length > 0;
var parseUnknownState = (raw) => {
  if (typeof raw !== "string") return raw;
  if (raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
var sanitizeState = (input) => {
  const source = isRecord(input) ? input : {};
  const pinsByFolderId = {};
  const noteToFolderIndex = {};
  if (isRecord(source.pinsByFolderId)) {
    for (const [folderId, maybeNoteIds] of Object.entries(source.pinsByFolderId)) {
      if (!isValidId(folderId) || !Array.isArray(maybeNoteIds)) continue;
      const cleaned = [];
      for (const noteId of maybeNoteIds) {
        if (!isValidId(noteId)) continue;
        if (noteToFolderIndex[noteId]) continue;
        noteToFolderIndex[noteId] = folderId;
        cleaned.push(noteId);
      }
      if (cleaned.length > 0) {
        pinsByFolderId[folderId] = cleaned;
      }
    }
  }
  const updatedAt = typeof source.updatedAt === "number" && Number.isFinite(source.updatedAt) ? source.updatedAt : Date.now();
  return {
    version: STATE_VERSION,
    pinsByFolderId,
    noteToFolderIndex,
    updatedAt
  };
};
var parseStoredState = (raw) => {
  const parsed = parseUnknownState(raw);
  if (!isRecord(parsed)) return createEmptyState();
  const candidateVersion = parsed.version;
  if (candidateVersion === STATE_VERSION || "pinsByFolderId" in parsed) {
    return sanitizeState(parsed);
  }
  return createEmptyState();
};
var normalizeMaxPins = (raw) => {
  const numberValue = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
};
var SettingsStateRepository = class {
  constructor(settings) {
    this.settings = settings;
  }
  async loadState() {
    const raw = await this.settings.value(STATE_SETTING_KEY);
    return parseStoredState(raw);
  }
  async saveState(state) {
    const sanitized = sanitizeState(state);
    sanitized.updatedAt = Date.now();
    await this.settings.setValue(STATE_SETTING_KEY, JSON.stringify(sanitized));
  }
  async getMaxPins() {
    const raw = await this.settings.value(MAX_PINS_SETTING_KEY);
    return normalizeMaxPins(raw);
  }
};

// src/pins-service.ts
var PinsService = class {
  constructor(repository, notesAdapter) {
    this.repository = repository;
    this.notesAdapter = notesAdapter;
    this.state = createEmptyState();
  }
  async init() {
    this.state = sanitizeState(await this.repository.loadState());
    await this.repository.saveState(this.state);
  }
  getPinnedIds(folderId) {
    const pins = this.state.pinsByFolderId[folderId];
    return pins ? [...pins] : [];
  }
  getStateSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
  async pinNote(noteId, folderId) {
    if (!noteId || !folderId) return { changed: false, message: "Missing note or notebook context." };
    const existingFolderId = this.state.noteToFolderIndex[noteId];
    if (existingFolderId === folderId) {
      return { changed: false, message: "This note is already pinned in this notebook." };
    }
    const maxPins = await this.repository.getMaxPins();
    const currentPins = this.state.pinsByFolderId[folderId] ?? [];
    if (maxPins > 0 && currentPins.length >= maxPins) {
      return {
        changed: false,
        message: `This notebook already has the maximum of ${maxPins} pins.`
      };
    }
    if (existingFolderId) {
      this.removePinInternal(noteId, existingFolderId);
    }
    if (!this.state.pinsByFolderId[folderId]) {
      this.state.pinsByFolderId[folderId] = [];
    }
    this.state.pinsByFolderId[folderId].push(noteId);
    this.state.noteToFolderIndex[noteId] = folderId;
    await this.persist();
    return { changed: true };
  }
  async unpinNote(noteId, folderId) {
    if (!noteId || !folderId) return { changed: false, message: "Missing note or notebook context." };
    const changed = this.removePinInternal(noteId, folderId);
    if (!changed) return { changed: false };
    await this.persist();
    return { changed: true };
  }
  async listPinnedNotes(folderId) {
    const noteIds = this.getPinnedIds(folderId);
    if (noteIds.length === 0) return [];
    const notes = [];
    const staleNoteIds = [];
    for (const noteId of noteIds) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!note || note.parent_id !== folderId) {
        staleNoteIds.push(noteId);
        continue;
      }
      notes.push({
        noteId,
        title: note.title || "(Untitled)",
        isTodo: Boolean(note.is_todo),
        todoCompleted: Boolean(note.todo_completed)
      });
    }
    if (staleNoteIds.length > 0) {
      for (const staleNoteId of staleNoteIds) {
        this.removePinInternal(staleNoteId, folderId);
      }
      await this.persist();
    }
    return notes;
  }
  async openPinnedNote(noteId) {
    await this.notesAdapter.openNote(noteId);
  }
  async handleNoteChange(noteId) {
    const folderId = this.state.noteToFolderIndex[noteId];
    if (!folderId) return;
    const note = await this.notesAdapter.getNote(noteId);
    if (!note || note.parent_id !== folderId) {
      const changed = this.removePinInternal(noteId, folderId);
      if (changed) await this.persist();
    }
  }
  removePinInternal(noteId, folderId) {
    const noteIds = this.state.pinsByFolderId[folderId];
    if (!noteIds) return false;
    const next = noteIds.filter((id) => id !== noteId);
    if (next.length === noteIds.length) return false;
    if (next.length > 0) {
      this.state.pinsByFolderId[folderId] = next;
    } else {
      delete this.state.pinsByFolderId[folderId];
    }
    if (this.state.noteToFolderIndex[noteId] === folderId) {
      delete this.state.noteToFolderIndex[noteId];
    }
    return true;
  }
  async persist() {
    this.state = sanitizeState(this.state);
    this.state.updatedAt = Date.now();
    await this.repository.saveState(this.state);
  }
};

// src/panel.ts
var NotebookPinsPanel = class {
  constructor(panelAdapter, onAction) {
    this.panelAdapter = panelAdapter;
    this.onAction = onAction;
    this.handle = null;
  }
  async init() {
    this.handle = await this.panelAdapter.create("notebookPins.panel");
    await this.panelAdapter.onMessage(this.handle, async (message) => {
      const action = parsePanelAction(message);
      if (!action) return;
      await this.onAction(action);
    });
    await this.render({
      folderId: null,
      folderName: null,
      title: "Pinned notes",
      emptyMessage: "Select a notebook to view pinned notes.",
      pins: [],
      capabilities: { reorder: false }
    });
  }
  async render(model) {
    if (!this.handle) return;
    await this.panelAdapter.setHtml(this.handle, getPanelHtml(model));
  }
};
var parsePanelAction = (message) => {
  let payload = message;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (typeof payload !== "object" || payload === null) return null;
  const event = payload;
  const type = event.type;
  if (type === "OPEN_NOTE" && typeof event.noteId === "string") {
    return { type, noteId: event.noteId };
  }
  if (type === "UNPIN_NOTE" && typeof event.noteId === "string" && typeof event.folderId === "string" && event.folderId.length > 0) {
    return { type, noteId: event.noteId, folderId: event.folderId };
  }
  if (type === "REORDER_PINS" && Array.isArray(event.noteIdsInOrder) && event.noteIdsInOrder.every((id) => typeof id === "string")) {
    return { type, noteIdsInOrder: event.noteIdsInOrder };
  }
  return null;
};
var escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var getPanelHtml = (model) => {
  const title = escapeHtml(model.title || "Pinned notes");
  const emptyMessage = escapeHtml(model.emptyMessage || "No pinned notes.");
  const errorMessage = model.error ? escapeHtml(model.error) : "";
  const folderId = model.folderId ? escapeHtml(model.folderId) : "";
  const pinsHtml = model.pins.length === 0 ? `<div class="empty">${emptyMessage}</div>` : `<ul>${model.pins.map((pin) => {
    const noteId = escapeHtml(pin.noteId);
    const noteTitle = escapeHtml(pin.title);
    const todoPrefix = pin.isTodo ? "[ ] " : "";
    const unpinAttrs = folderId ? `data-action="unpin" data-note-id="${noteId}" data-folder-id="${folderId}"` : "disabled";
    return `<li>
              <span class="title">${todoPrefix}${noteTitle}</span>
              <span class="actions">
                <button type="button" data-action="open" data-note-id="${noteId}">Open</button>
                <button type="button" ${unpinAttrs}>Unpin</button>
              </span>
            </li>`;
  }).join("")}</ul>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 12px;
        font: 13px/1.4 sans-serif;
      }
      h2 {
        margin: 0 0 10px;
        font-size: 14px;
      }
      .empty {
        opacity: 0.8;
      }
      .error {
        margin: 0 0 10px;
        padding: 8px;
        border: 1px solid #d14343;
        border-radius: 4px;
        background: rgba(209, 67, 67, 0.1);
        color: #d14343;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(127, 127, 127, 0.25);
      }
      .title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .todo {
        margin-right: 4px;
      }
      .actions {
        display: inline-flex;
        gap: 6px;
        flex-shrink: 0;
      }
      button {
        font: inherit;
      }
    </style>
  </head>
  <body>
    <h2>${title}</h2>
    ${errorMessage ? `<div id="error" class="error">${errorMessage}</div>` : ""}
    <div id="content">${pinsHtml}</div>
    <script>
      const getWebviewApi = () => {
        if (typeof webviewApi !== 'undefined' && webviewApi) return webviewApi;
        if (typeof window !== 'undefined' && window.webviewApi) return window.webviewApi;
        return null;
      };
      const api = getWebviewApi();

      const post = (event) => {
        if (api && typeof api.postMessage === 'function') {
          api.postMessage(event);
        }
      };

      if (!api || typeof api.postMessage !== 'function') {
        const content = document.getElementById('content');
        if (content) {
          const warning = document.createElement('div');
          warning.className = 'error';
          warning.textContent = 'Panel actions are unavailable: webview bridge not found.';
          content.prepend(warning);
        }
      }

      const buttons = document.querySelectorAll('button[data-action]');
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.getAttribute('data-action');
          if (action === 'open') {
            const noteId = button.getAttribute('data-note-id');
            if (noteId) post({ type: 'OPEN_NOTE', noteId });
            return;
          }

          if (action === 'unpin') {
            const noteId = button.getAttribute('data-note-id');
            const currentFolderId = button.getAttribute('data-folder-id');
            if (noteId && currentFolderId) {
              post({ type: 'UNPIN_NOTE', noteId, folderId: currentFolderId });
            }
          }
        });
      });
    </script>
  </body>
</html>`;
};

// src/index.ts
var resolveJoplinApi = () => {
  if (typeof joplin !== "undefined" && joplin) return joplin;
  const globalJoplin = globalThis.joplin;
  if (globalJoplin && typeof globalJoplin === "object") return globalJoplin;
  try {
    const apiModule = require("api");
    return apiModule?.default ?? apiModule;
  } catch {
    throw new Error(
      "Notebook Pins could not resolve the Joplin plugin API. Check development plugin loading configuration."
    );
  }
};
var joplinApi = resolveJoplinApi();
var SettingItemType = {
  // Joplin SettingItemType enum values:
  // Int=1, String=2, Bool=3
  Int: 1,
  String: 2,
  Bool: 3
};
var SETTINGS_SECTION = "notebookPins";
var showUserMessage = async (message) => {
  try {
    await joplinApi.views.dialogs.showMessageBox(message);
  } catch {
    console.info(message);
  }
};
var getSelectedFolder = async () => {
  const folder = await joplinApi.workspace.selectedFolder();
  if (!folder || typeof folder.id !== "string") return null;
  return {
    id: folder.id,
    title: typeof folder.title === "string" ? folder.title : "Notebook"
  };
};
var getPrimarySelectedNoteId = async () => {
  const noteIds = await joplinApi.workspace.selectedNoteIds();
  if (Array.isArray(noteIds) && noteIds.length > 0 && typeof noteIds[0] === "string") {
    return noteIds[0];
  }
  const selected = await joplinApi.workspace.selectedNote();
  if (selected && typeof selected.id === "string") return selected.id;
  return null;
};
var createNotesAdapter = () => ({
  getNote: async (noteId) => {
    try {
      return await joplinApi.data.get(["notes", noteId], {
        fields: ["id", "title", "parent_id", "is_todo", "todo_completed"]
      });
    } catch {
      return null;
    }
  },
  openNote: async (noteId) => {
    await joplinApi.commands.execute("openNote", noteId);
  }
});
joplinApi.plugins.register({
  onStart: async () => {
    await joplinApi.settings.registerSection(SETTINGS_SECTION, {
      label: "Notebook Pins",
      iconName: "fas fa-thumbtack"
    });
    await joplinApi.settings.registerSettings({
      [STATE_SETTING_KEY]: {
        public: false,
        section: SETTINGS_SECTION,
        type: SettingItemType.String,
        value: "",
        label: "Notebook pin state"
      },
      [MAX_PINS_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Int,
        value: 0,
        label: "Max pins per notebook",
        description: "Set to 0 for unlimited."
      }
    });
    const repository = new SettingsStateRepository({
      value: async (key) => joplinApi.settings.value(key),
      setValue: async (key, value) => joplinApi.settings.setValue(key, value)
    });
    const notesAdapter = createNotesAdapter();
    const service = new PinsService(repository, notesAdapter);
    await service.init();
    let refreshPanel = async () => {
    };
    const panel = new NotebookPinsPanel(joplinApi.views.panels, async (action) => {
      if (action.type === "OPEN_NOTE") {
        await joplinApi.commands.execute(COMMAND_OPEN_PINNED, action.noteId);
        return;
      }
      if (action.type === "UNPIN_NOTE") {
        await service.unpinNote(action.noteId, action.folderId);
        await refreshPanel();
        return;
      }
      if (action.type === "REORDER_PINS") {
        await showUserMessage("Reordering is planned for v1.1.");
      }
    });
    await panel.init();
    refreshPanel = async () => {
      try {
        const folder = await getSelectedFolder();
        if (!folder) {
          const model2 = {
            folderId: null,
            folderName: null,
            title: "Pinned notes",
            emptyMessage: "Select a notebook to view pinned notes.",
            pins: [],
            capabilities: { reorder: false }
          };
          await panel.render(model2);
          return;
        }
        const pinnedNotes = await service.listPinnedNotes(folder.id);
        const model = {
          folderId: folder.id,
          folderName: folder.title,
          title: `Pinned in "${folder.title}"`,
          emptyMessage: "Right-click a note -> Pin in this notebook.",
          pins: pinnedNotes,
          capabilities: { reorder: false }
        };
        await panel.render(model);
      } catch (error) {
        const model = {
          folderId: null,
          folderName: null,
          title: "Pinned notes",
          emptyMessage: "Unable to render pinned notes right now.",
          pins: [],
          capabilities: { reorder: false },
          error: error instanceof Error ? error.message : "Unknown error"
        };
        await panel.render(model);
      }
    };
    await registerCommandsAndMenus(joplinApi, {
      onPinSelected: async () => {
        const folder = await getSelectedFolder();
        const noteId = await getPrimarySelectedNoteId();
        if (!folder || !noteId) {
          await showUserMessage("Select a note in a notebook before pinning.");
          return;
        }
        const note = await notesAdapter.getNote(noteId);
        if (!note) {
          await showUserMessage("The selected note is not available.");
          return;
        }
        if (note.parent_id !== folder.id) {
          await showUserMessage("You can only pin notes that belong to the current notebook.");
          return;
        }
        const result = await service.pinNote(noteId, folder.id);
        if (result.message) await showUserMessage(result.message);
        await refreshPanel();
      },
      onUnpinSelected: async () => {
        const folder = await getSelectedFolder();
        const noteId = await getPrimarySelectedNoteId();
        if (!folder || !noteId) {
          await showUserMessage("Select a note in a notebook before unpinning.");
          return;
        }
        const result = await service.unpinNote(noteId, folder.id);
        if (result.message) await showUserMessage(result.message);
        await refreshPanel();
      },
      onOpenPinned: async (noteId) => {
        await service.openPinnedNote(noteId);
      }
    });
    await registerWorkspaceEvents(joplinApi, {
      refresh: refreshPanel,
      handleNoteChange: async (noteId) => {
        await service.handleNoteChange(noteId);
      }
    });
    await refreshPanel();
  }
});
