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
var isUnsupportedWorkspaceEventError = (error) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("property or method") && message.includes("does not exist");
};
var registerOptionalWorkspaceEvent = async (workspace, eventName, callback) => {
  const register = workspace?.[eventName];
  if (typeof register !== "function") return;
  try {
    await register(callback);
  } catch (error) {
    if (isUnsupportedWorkspaceEventError(error)) {
      return;
    }
    throw error;
  }
};
var registerWorkspaceEvents = async (joplin2, handlers) => {
  const debouncedRefresh = debounce(() => {
    void handlers.refresh();
  }, 150);
  await joplin2.workspace.onNoteSelectionChange(async () => {
    debouncedRefresh();
  });
  await registerOptionalWorkspaceEvent(
    joplin2.workspace,
    "onFolderSelectionChange",
    async () => {
      await handlers.refresh();
    }
  );
  await registerOptionalWorkspaceEvent(
    joplin2.workspace,
    "onNoteChange",
    async (event) => {
      if (event && typeof event.id === "string") {
        await handlers.handleNoteChange(event.id);
      }
      debouncedRefresh();
    }
  );
  await registerOptionalWorkspaceEvent(
    joplin2.workspace,
    "onSyncComplete",
    async () => {
      debouncedRefresh();
    }
  );
};

// src/storage.ts
var STATE_SETTING_KEY = "notebookPins.state";
var MAX_PINS_SETTING_KEY = "notebookPins.maxPinsPerNotebook";
var AUTO_MIGRATE_ON_MOVE_SETTING_KEY = "notebookPins.autoMigrateOnMove";
var SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY = "notebookPins.showHorizontalScrollbar";
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
var normalizeBooleanSetting = (raw) => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return false;
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
  async getAutoMigrateOnMove() {
    const raw = await this.settings.value(AUTO_MIGRATE_ON_MOVE_SETTING_KEY);
    return normalizeBooleanSetting(raw);
  }
  async getShowHorizontalScrollbar() {
    const raw = await this.settings.value(SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY);
    return normalizeBooleanSetting(raw);
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
  async reorderPins(folderId, noteIdsInOrder) {
    if (!folderId) return { changed: false, message: "Missing notebook context." };
    if (!Array.isArray(noteIdsInOrder) || noteIdsInOrder.length === 0) {
      return { changed: false, message: "No pinned notes to reorder." };
    }
    const current = this.state.pinsByFolderId[folderId] ?? [];
    if (current.length === 0) return { changed: false, message: "No pinned notes to reorder." };
    const uniqueRequested = [...new Set(noteIdsInOrder)];
    if (uniqueRequested.length !== noteIdsInOrder.length) {
      return { changed: false, message: "Invalid reorder payload." };
    }
    if (uniqueRequested.length !== current.length) {
      return { changed: false, message: "Invalid reorder payload." };
    }
    const currentSet = new Set(current);
    if (!uniqueRequested.every((noteId) => currentSet.has(noteId))) {
      return { changed: false, message: "Invalid reorder payload." };
    }
    const orderUnchanged = current.every((noteId, index) => noteId === uniqueRequested[index]);
    if (orderUnchanged) return { changed: false };
    this.state.pinsByFolderId[folderId] = uniqueRequested;
    await this.persist();
    return { changed: true };
  }
  async listPinnedNotes(folderId) {
    const noteIds = this.getPinnedIds(folderId);
    if (noteIds.length === 0) return [];
    const notes = [];
    const staleNoteIds = [];
    const migratedNoteIds = [];
    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();
    for (const noteId of noteIds) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!isLiveNote(note) || typeof note.parent_id !== "string" || note.parent_id.length === 0) {
        staleNoteIds.push(noteId);
        continue;
      }
      if (note.parent_id !== folderId) {
        if (autoMigrateOnMove) {
          migratedNoteIds.push({ noteId, toFolderId: note.parent_id });
        } else {
          staleNoteIds.push(noteId);
        }
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
    }
    if (migratedNoteIds.length > 0) {
      for (const migration of migratedNoteIds) {
        this.movePinInternal(migration.noteId, folderId, migration.toFolderId);
      }
    }
    if (staleNoteIds.length > 0 || migratedNoteIds.length > 0) {
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
    if (!isLiveNote(note) || typeof note.parent_id !== "string" || note.parent_id.length === 0) {
      const changed2 = this.removePinInternal(noteId, folderId);
      if (changed2) await this.persist();
      return;
    }
    if (note.parent_id === folderId) return;
    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();
    if (!autoMigrateOnMove) {
      const changed2 = this.removePinInternal(noteId, folderId);
      if (changed2) await this.persist();
      return;
    }
    const changed = this.movePinInternal(noteId, folderId, note.parent_id);
    if (changed) {
      await this.persist();
    }
  }
  async reconcilePins() {
    const indexEntries = Object.entries(this.state.noteToFolderIndex);
    if (indexEntries.length === 0) return;
    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();
    let changed = false;
    for (const [noteId, folderId] of indexEntries) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!isLiveNote(note) || typeof note.parent_id !== "string" || note.parent_id.length === 0) {
        changed = this.removePinInternal(noteId, folderId) || changed;
        continue;
      }
      if (note.parent_id === folderId) continue;
      if (!autoMigrateOnMove) {
        changed = this.removePinInternal(noteId, folderId) || changed;
        continue;
      }
      changed = this.movePinInternal(noteId, folderId, note.parent_id) || changed;
    }
    if (changed) await this.persist();
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
  movePinInternal(noteId, fromFolderId, toFolderId) {
    if (!toFolderId || fromFolderId === toFolderId) return false;
    const removed = this.removePinInternal(noteId, fromFolderId);
    if (!removed) return false;
    if (!this.state.pinsByFolderId[toFolderId]) {
      this.state.pinsByFolderId[toFolderId] = [];
    }
    if (!this.state.pinsByFolderId[toFolderId].includes(noteId)) {
      this.state.pinsByFolderId[toFolderId].push(noteId);
    }
    this.state.noteToFolderIndex[noteId] = toFolderId;
    return true;
  }
  async persist() {
    this.state = sanitizeState(this.state);
    this.state.updatedAt = Date.now();
    await this.repository.saveState(this.state);
  }
};
var isLiveNote = (note) => {
  if (!note) return false;
  return !(typeof note.deleted_time === "number" && note.deleted_time > 0);
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
      title: "PINNED",
      emptyMessage: "Select a notebook to view pinned notes.",
      showHorizontalScrollbar: false,
      pins: [],
      capabilities: { reorder: false }
    });
  }
  async render(model) {
    if (!this.handle) return;
    await this.panelAdapter.setHtml(this.handle, getPanelHtml(model));
    await addPanelScript(this.panelAdapter, this.handle);
  }
};
var addPanelScript = async (panelAdapter, handle) => {
  const candidates = ["./dist/panel-webview.js"];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      await panelAdapter.addScript(handle, candidate);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? new Error(`Unable to load panel webview script: ${lastError.message}`) : new Error("Unable to load panel webview script.");
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
  if (type === "REORDER_PINS" && typeof event.folderId === "string" && event.folderId.length > 0 && Array.isArray(event.noteIdsInOrder) && event.noteIdsInOrder.every((id) => typeof id === "string")) {
    return { type, folderId: event.folderId, noteIdsInOrder: event.noteIdsInOrder };
  }
  return null;
};
var escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var getPanelHtml = (model) => {
  const title = escapeHtml(model.title || "PINNED");
  const errorMessage = model.error ? escapeHtml(model.error) : "";
  const folderId = typeof model.folderId === "string" ? escapeHtml(model.folderId) : "";
  const contentClass = model.showHorizontalScrollbar ? "scroll-visible" : "scroll-hidden";
  const pinsHtml = model.pins.length === 0 ? "" : model.pins.map((pin) => {
    const noteId = escapeHtml(pin.noteId);
    const noteTitle = escapeHtml(pin.title);
    const todoPrefix = pin.isTodo ? "[ ] " : "";
    const draggable = model.capabilities.reorder ? ' draggable="true"' : "";
    const reorderFlag = model.capabilities.reorder ? "1" : "0";
    return `<button type="button" class="pin-chip" data-action="open" data-note-id="${noteId}" data-reorder="${reorderFlag}" title="${noteTitle}"${draggable}><span class="item-icon">&#128196;&#65038;</span><span class="pin-label">${todoPrefix}${noteTitle}</span></button>`;
  }).join("");
  return `
<style>
  :root {
    color-scheme: light;
  }
  body {
    margin: 0;
    padding: 6px 8px;
    font: 12px/1.4 sans-serif;
    background: #F4F5F6;
    color: #627184;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    background: #F4F5F6;
  }
  .strip-title {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
    color: #627184;
  }
  .banner-icon {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 1;
    color: #627184;
  }
  #panel-content {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-width: 0;
    min-height: 22px;
    flex: 1 1 auto;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    background: #F4F5F6;
  }
  #panel-content.scroll-visible {
    scrollbar-width: auto;
    -ms-overflow-style: auto;
    min-height: 28px;
  }
  #panel-content.scroll-visible::-webkit-scrollbar {
    height: 8px;
  }
  #panel-content.scroll-visible::-webkit-scrollbar-track {
    background: #e5e8ec;
  }
  #panel-content.scroll-visible::-webkit-scrollbar-thumb {
    background: #b5bfcc;
    border-radius: 999px;
  }
  #panel-content.scroll-visible::-webkit-scrollbar-thumb:hover {
    background: #97a6b9;
  }
  #panel-content.scroll-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  #panel-content.scroll-hidden::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  .pin-chip {
    flex: 0 0 auto;
    max-width: 220px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
    margin: 0;
    height: 22px;
    padding: 0 12px;
    border: 0;
    border-radius: 0;
    appearance: none;
    -webkit-appearance: none;
    background: #F4F5F6;
    color: #627184;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    position: relative;
  }
  .pin-chip[data-reorder="1"] {
    cursor: grab;
  }
  .pin-chip[data-reorder="1"]:active {
    cursor: grabbing;
  }
  .pin-chip:hover {
    background: #CBDAF1;
  }
  .pin-chip + .pin-chip {
    margin-left: 8px;
  }
  .pin-chip + .pin-chip::before {
    content: '';
    position: absolute;
    left: -4px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(98, 113, 132, 0.45);
  }
  .pin-chip.dragging {
    opacity: 0.65;
  }
  .pin-chip.drop-before {
    box-shadow: inset 2px 0 0 #8faed6;
  }
  .pin-chip.drop-after {
    box-shadow: inset -2px 0 0 #8faed6;
  }
  .pin-chip:focus-visible {
    outline: 1px solid #8faed6;
    outline-offset: 1px;
  }
  .item-icon {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 1;
    color: #627184;
  }
  .pin-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .error {
    margin-top: 6px;
    padding: 4px 6px;
    border: 1px solid #d14343;
    border-radius: 4px;
    background: rgba(209, 67, 67, 0.1);
    color: #d14343;
    font-size: 12px;
  }
</style>
<div class="strip">
  <span class="strip-title"><span class="banner-icon">&#128204;&#65038;</span><span>${title}</span></span>
  <div id="panel-content" class="${contentClass}" data-folder-id="${folderId}">${pinsHtml}</div>
</div>
${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}`;
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
var isUnsupportedSettingsEventError = (error) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("property or method") && message.includes("does not exist");
};
var createNotesAdapter = () => ({
  getNote: async (noteId) => {
    try {
      return await joplinApi.data.get(["notes", noteId], {
        fields: ["id", "title", "parent_id", "is_todo", "todo_completed", "deleted_time"]
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
      },
      [AUTO_MIGRATE_ON_MOVE_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Bool,
        value: false,
        label: "Auto-migrate pins when notes move notebooks"
      },
      [SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Bool,
        value: false,
        label: "Show horizontal scrollbar in pinned strip"
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
        await service.reorderPins(action.folderId, action.noteIdsInOrder);
        await refreshPanel();
      }
    });
    await panel.init();
    refreshPanel = async () => {
      try {
        await service.reconcilePins();
        const folder = await getSelectedFolder();
        if (!folder) {
          const model2 = {
            folderId: null,
            folderName: null,
            title: "PINNED",
            emptyMessage: "Select a notebook to view pinned notes.",
            showHorizontalScrollbar: false,
            pins: [],
            capabilities: { reorder: false }
          };
          await panel.render(model2);
          return;
        }
        const [pinnedNotes, showHorizontalScrollbar] = await Promise.all([
          service.listPinnedNotes(folder.id),
          repository.getShowHorizontalScrollbar()
        ]);
        const model = {
          folderId: folder.id,
          folderName: folder.title,
          title: "PINNED",
          emptyMessage: "Right-click a note \u2192 Pin in this notebook.",
          showHorizontalScrollbar,
          pins: pinnedNotes,
          capabilities: { reorder: true }
        };
        await panel.render(model);
      } catch (error) {
        const model = {
          folderId: null,
          folderName: null,
          title: "PINNED",
          emptyMessage: "Unable to render pinned notes right now.",
          showHorizontalScrollbar: false,
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
    if (typeof joplinApi.settings?.onChange === "function") {
      try {
        await joplinApi.settings.onChange(async (event) => {
          const changedKeys = Array.isArray(event?.keys) ? event.keys : [];
          if (changedKeys.length === 0 || changedKeys.includes(SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY)) {
            await refreshPanel();
          }
        });
      } catch (error) {
        if (!isUnsupportedSettingsEventError(error)) {
          throw error;
        }
      }
    }
    await refreshPanel();
  }
});
