import { PanelAction, PanelRenderModel } from './types';

interface PanelAdapter {
  create(id: string): Promise<string>;
  setHtml(handle: string, html: string): Promise<void>;
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
      title: 'Pinned notes',
      emptyMessage: 'Select a notebook to view pinned notes.',
      pins: [],
      capabilities: { reorder: false },
    });
  }

  async render(model: PanelRenderModel): Promise<void> {
    if (!this.handle) return;
    await this.panelAdapter.setHtml(this.handle, getPanelHtml(model));
  }
}

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
  const title = escapeHtml(model.title || 'Pinned notes');
  const emptyMessage = escapeHtml(model.emptyMessage || 'No pinned notes.');
  const errorMessage = model.error ? escapeHtml(model.error) : '';
  const folderId = model.folderId ? escapeHtml(model.folderId) : '';

  const pinsHtml =
    model.pins.length === 0
      ? `<div class="empty">${emptyMessage}</div>`
      : `<ul>${model.pins
          .map((pin) => {
            const noteId = escapeHtml(pin.noteId);
            const noteTitle = escapeHtml(pin.title);
            const todoPrefix = pin.isTodo ? '[ ] ' : '';
            const unpinAttrs = folderId
              ? `data-action="unpin" data-note-id="${noteId}" data-folder-id="${folderId}"`
              : 'disabled';
            return `<li>
              <span class="title">${todoPrefix}${noteTitle}</span>
              <span class="actions">
                <button type="button" data-action="open" data-note-id="${noteId}">Open</button>
                <button type="button" ${unpinAttrs}>Unpin</button>
              </span>
            </li>`;
          })
          .join('')}</ul>`;

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
    ${errorMessage ? `<div id="error" class="error">${errorMessage}</div>` : ''}
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
