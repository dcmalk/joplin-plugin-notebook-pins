import { PanelAction, PanelRenderModel } from './types';

interface PanelAdapter {
  create(id: string): Promise<string>;
  setHtml(handle: string, html: string): Promise<void>;
  addScript(handle: string, scriptPath: string): Promise<void>;
  onMessage(handle: string, callback: (message: unknown) => Promise<void>): Promise<void>;
}

export class NotebookPinsPanel {
  private handle: string | null = null;

  constructor(
    private readonly panelAdapter: PanelAdapter,
    private readonly onAction: (action: PanelAction) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    this.handle = await this.panelAdapter.create('notebookPins.panel');
    await this.panelAdapter.onMessage(this.handle, async (message) => {
      const action = parsePanelAction(message);
      if (!action) return;
      await this.onAction(action);
    });

    await this.render({
      folderId: null,
      folderName: null,
      title: 'PINNED',
      emptyMessage: 'Select a notebook to view pinned notes.',
      showHorizontalScrollbar: false,
      pins: [],
      capabilities: { reorder: false },
    });
  }

  async render(model: PanelRenderModel): Promise<void> {
    if (!this.handle) return;
    await this.panelAdapter.setHtml(this.handle, getPanelHtml(model));
    await addPanelScript(this.panelAdapter, this.handle);
  }
}

const addPanelScript = async (panelAdapter: PanelAdapter, handle: string): Promise<void> => {
  const candidates = ['./dist/panel-webview.js'];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      await panelAdapter.addScript(handle, candidate);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? new Error(`Unable to load panel webview script: ${lastError.message}`)
    : new Error('Unable to load panel webview script.');
};

const parsePanelAction = (message: unknown): PanelAction | null => {
  let payload: unknown = message;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (typeof payload !== 'object' || payload === null) return null;
  const event = payload as Record<string, unknown>;
  const type = event.type;

  if (type === 'OPEN_NOTE' && typeof event.noteId === 'string') {
    return { type, noteId: event.noteId };
  }
  if (
    type === 'UNPIN_NOTE' &&
    typeof event.noteId === 'string' &&
    typeof event.folderId === 'string' &&
    event.folderId.length > 0
  ) {
    return { type, noteId: event.noteId, folderId: event.folderId };
  }
  if (
    type === 'REORDER_PINS' &&
    typeof event.folderId === 'string' &&
    event.folderId.length > 0 &&
    Array.isArray(event.noteIdsInOrder) &&
    event.noteIdsInOrder.every((id) => typeof id === 'string')
  ) {
    return { type, folderId: event.folderId, noteIdsInOrder: event.noteIdsInOrder };
  }

  return null;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getPanelHtml = (model: PanelRenderModel): string => {
  const title = escapeHtml(model.title || 'PINNED');
  const errorMessage = model.error ? escapeHtml(model.error) : '';
  const folderId = typeof model.folderId === 'string' ? escapeHtml(model.folderId) : '';
  const contentClass = model.showHorizontalScrollbar ? 'scroll-visible' : 'scroll-hidden';
  const pinsHtml =
    model.pins.length === 0
      ? ''
      : model.pins
          .map((pin) => {
            const noteId = escapeHtml(pin.noteId);
            const noteTitle = escapeHtml(pin.title);
            const todoPrefix = pin.isTodo ? '[ ] ' : '';
            const draggable = model.capabilities.reorder ? ' draggable="true"' : '';
            const reorderFlag = model.capabilities.reorder ? '1' : '0';
            return `<button type="button" class="pin-chip" data-action="open" data-note-id="${noteId}" data-reorder="${reorderFlag}" title="${noteTitle}"${draggable}><span class="item-icon">&#128196;&#65038;</span><span class="pin-label">${todoPrefix}${noteTitle}</span></button>`;
          })
          .join('');

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
${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}`;
};
