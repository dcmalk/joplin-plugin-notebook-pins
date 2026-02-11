interface WebviewBridge {
  postMessage(message: unknown): void;
}

declare const webviewApi: WebviewBridge | undefined;

const resolveBridge = (): WebviewBridge | null => {
  if (typeof webviewApi !== 'undefined' && webviewApi) return webviewApi;

  const windowWithBridge = window as Window & { webviewApi?: WebviewBridge };
  if (windowWithBridge.webviewApi) return windowWithBridge.webviewApi;

  return null;
};

const updateBridgeStatus = (status: string): void => {
  const statusEl = document.getElementById('bridge-status');
  if (!statusEl) return;
  statusEl.textContent = `Bridge: ${status}`;
};

const postToHost = (message: unknown): void => {
  const bridge = resolveBridge();
  if (!bridge || typeof bridge.postMessage !== 'function') {
    updateBridgeStatus('missing');
    return;
  }

  updateBridgeStatus('ready');
  bridge.postMessage(message);
};

const handleDocumentClick = (event: Event): void => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest('button[data-action]');
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.getAttribute('data-action');
  if (action === 'open') {
    const noteId = button.getAttribute('data-note-id');
    if (!noteId) return;
    postToHost({ type: 'OPEN_NOTE', noteId });
    return;
  }

  if (action === 'unpin') {
    const noteId = button.getAttribute('data-note-id');
    const folderId = button.getAttribute('data-folder-id');
    if (!noteId || !folderId) return;
    postToHost({ type: 'UNPIN_NOTE', noteId, folderId });
  }
};

const initializeBridgeStatus = (): void => {
  if (resolveBridge()) {
    updateBridgeStatus('ready');
    return;
  }

  updateBridgeStatus('pending');

  const startedAt = Date.now();
  const poll = window.setInterval(() => {
    if (resolveBridge()) {
      updateBridgeStatus('ready');
      window.clearInterval(poll);
      return;
    }

    if (Date.now() - startedAt > 5000) {
      updateBridgeStatus('missing');
      window.clearInterval(poll);
    }
  }, 100);
};

document.addEventListener('click', handleDocumentClick);
initializeBridgeStatus();