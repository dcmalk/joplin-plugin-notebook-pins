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

const postToHost = (message: unknown): void => {
  const bridge = resolveBridge();
  if (!bridge || typeof bridge.postMessage !== 'function') return;
  bridge.postMessage(message);
};

const handleDocumentClick = (event: Event): void => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest('button[data-action="open"]');
  if (!(button instanceof HTMLButtonElement)) return;

  const noteId = button.getAttribute('data-note-id');
  if (!noteId) return;
  postToHost({ type: 'OPEN_NOTE', noteId });
};

document.addEventListener('click', handleDocumentClick);
