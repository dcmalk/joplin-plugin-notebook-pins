import { PanelAction, PanelRenderModel } from './types';

interface PanelAdapter {
  create(id: string): Promise<string>;
  setHtml(handle: string, html: string): Promise<void>;
  onMessage(handle: string, callback: (message: unknown) => Promise<void>): Promise<void>;
  postMessage(handle: string, message: unknown): Promise<void>;
}

export class NotebookPinsPanel {
  private handle: string | null = null;

  constructor(
    private readonly panelAdapter: PanelAdapter,
    private readonly onAction: (action: PanelAction) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    this.handle = await this.panelAdapter.create('notebookPins.panel');
    await this.panelAdapter.setHtml(this.handle, getPanelHtml());
    await this.panelAdapter.onMessage(this.handle, async (message) => {
      const action = parsePanelAction(message);
      if (!action) return;
      await this.onAction(action);
    });
  }

  async render(model: PanelRenderModel): Promise<void> {
    if (!this.handle) return;
    await this.panelAdapter.postMessage(this.handle, {
      type: 'RENDER',
      payload: model,
    });
  }
}

const parsePanelAction = (message: unknown): PanelAction | null => {
  if (typeof message !== 'object' || message === null) return null;
  const event = message as Record<string, unknown>;
  const type = event.type;

  if (type === 'OPEN_NOTE' && typeof event.noteId === 'string') {
    return { type, noteId: event.noteId };
  }
  if (type === 'UNPIN_NOTE' && typeof event.noteId === 'string') {
    return { type, noteId: event.noteId };
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

const getPanelHtml = (): string => `<!doctype html>
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
    <h2 id="panel-title">Pinned notes</h2>
    <div id="content"></div>
    <script>
      const state = {
        title: 'Pinned notes',
        pins: [],
        emptyMessage: 'Right-click a note -> Pin in this notebook.',
      };

      const panelTitle = document.getElementById('panel-title');
      const content = document.getElementById('content');

      const post = (event) => {
        if (window.webviewApi && typeof window.webviewApi.postMessage === 'function') {
          window.webviewApi.postMessage(event);
        }
      };

      const render = () => {
        panelTitle.textContent = state.title || 'Pinned notes';

        if (!state.pins || state.pins.length === 0) {
          content.innerHTML = '<div class="empty"></div>';
          content.querySelector('.empty').textContent = state.emptyMessage || 'No pinned notes.';
          return;
        }

        const list = document.createElement('ul');
        for (const pin of state.pins) {
          const item = document.createElement('li');

          const title = document.createElement('span');
          title.className = 'title';
          title.textContent = (pin.isTodo ? '[ ] ' : '') + pin.title;

          const actions = document.createElement('span');
          actions.className = 'actions';

          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.textContent = 'Open';
          openBtn.addEventListener('click', () => post({ type: 'OPEN_NOTE', noteId: pin.noteId }));

          const unpinBtn = document.createElement('button');
          unpinBtn.type = 'button';
          unpinBtn.textContent = 'Unpin';
          unpinBtn.addEventListener('click', () => post({ type: 'UNPIN_NOTE', noteId: pin.noteId }));

          actions.appendChild(openBtn);
          actions.appendChild(unpinBtn);
          item.appendChild(title);
          item.appendChild(actions);
          list.appendChild(item);
        }

        content.innerHTML = '';
        content.appendChild(list);
      };

      const handleRenderMessage = (message) => {
        if (!message || message.type !== 'RENDER') return;
        Object.assign(state, message.payload || {});
        render();
      };

      if (window.webviewApi && typeof window.webviewApi.onMessage === 'function') {
        window.webviewApi.onMessage(handleRenderMessage);
      } else {
        window.addEventListener('message', (event) => handleRenderMessage(event.data));
      }

      render();
    </script>
  </body>
</html>`;
