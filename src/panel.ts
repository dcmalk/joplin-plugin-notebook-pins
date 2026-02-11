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
    Array.isArray(event.noteIdsInOrder) &&
    event.noteIdsInOrder.every((id) => typeof id === 'string')
  ) {
    return { type, noteIdsInOrder: event.noteIdsInOrder };
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
  const pinsHtml =
    model.pins.length === 0
      ? ''
      : model.pins
          .map((pin, index) => {
            const noteId = escapeHtml(pin.noteId);
            const noteTitle = escapeHtml(pin.title);
            const todoPrefix = pin.isTodo ? '[ ] ' : '';
            const separator = index > 0 ? `<span class="pin-sep" aria-hidden="true"></span>` : '';
            return `${separator}<button type="button" class="pin-chip" data-action="open" data-note-id="${noteId}" title="${noteTitle}"><span class="item-icon">&#128196;&#65038;</span><span class="pin-label">${todoPrefix}${noteTitle}</span></button>`;
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
    scrollbar-width: thin;
    background: #F4F5F6;
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
  }
  .pin-chip:hover {
    background: #CBDAF1;
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
  .pin-sep {
    align-self: stretch;
    flex: 0 0 1px;
    width: 1px;
    margin: 0 4px;
    background: rgba(98, 113, 132, 0.45);
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
  <div id="panel-content">${pinsHtml}</div>
</div>
${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}`;
};
