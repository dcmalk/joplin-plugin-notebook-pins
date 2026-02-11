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

const getPanelContent = (): HTMLElement | null => document.getElementById('panel-content');

const getChipFromEvent = (event: Event): HTMLButtonElement | null => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return null;
  const button = target.closest('button[data-action="open"]');
  return button instanceof HTMLButtonElement ? button : null;
};

const isReorderEnabled = (chip: HTMLButtonElement): boolean =>
  chip.getAttribute('data-reorder') === '1';

const getFolderIdForReorder = (): string | null => {
  const panelContent = getPanelContent();
  if (!panelContent) return null;
  const folderId = panelContent.getAttribute('data-folder-id');
  if (!folderId || folderId.length === 0) return null;
  return folderId;
};

const getCurrentOrder = (): string[] => {
  const panelContent = getPanelContent();
  if (!panelContent) return [];
  return Array.from(panelContent.querySelectorAll('button[data-action="open"]'))
    .map((node) => node.getAttribute('data-note-id') ?? '')
    .filter((noteId) => noteId.length > 0);
};

let draggingChip: HTMLButtonElement | null = null;
let suppressNextClick = false;

const clearDropIndicators = (): void => {
  document
    .querySelectorAll('button[data-action="open"].drop-before, button[data-action="open"].drop-after')
    .forEach((node) => {
      node.classList.remove('drop-before');
      node.classList.remove('drop-after');
    });
};

const applyDropIndicator = (targetChip: HTMLButtonElement, placeAfter: boolean): void => {
  clearDropIndicators();
  targetChip.classList.add(placeAfter ? 'drop-after' : 'drop-before');
};

const handleDocumentClick = (event: Event): void => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  const button = getChipFromEvent(event);
  if (!button) return;

  const noteId = button.getAttribute('data-note-id');
  if (!noteId) return;
  postToHost({ type: 'OPEN_NOTE', noteId });
};

const handleDragStart = (event: DragEvent): void => {
  const chip = getChipFromEvent(event);
  if (!chip || !isReorderEnabled(chip)) return;

  draggingChip = chip;
  chip.classList.add('dragging');
  suppressNextClick = true;

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    const noteId = chip.getAttribute('data-note-id') ?? '';
    event.dataTransfer.setData('text/plain', noteId);
  }
};

const handleDragOver = (event: DragEvent): void => {
  if (!draggingChip) return;
  const targetChip = getChipFromEvent(event);
  if (!targetChip || targetChip === draggingChip) return;
  if (!isReorderEnabled(targetChip)) return;

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const bounds = targetChip.getBoundingClientRect();
  const placeAfter = event.clientX > bounds.left + bounds.width / 2;
  applyDropIndicator(targetChip, placeAfter);
};

const emitReorderIfPossible = (): void => {
  const folderId = getFolderIdForReorder();
  if (!folderId) return;

  const noteIdsInOrder = getCurrentOrder();
  if (noteIdsInOrder.length === 0) return;

  postToHost({
    type: 'REORDER_PINS',
    folderId,
    noteIdsInOrder,
  });
};

const handleDrop = (event: DragEvent): void => {
  if (!draggingChip) return;
  const panelContent = getPanelContent();
  if (!panelContent) return;

  const targetChip = getChipFromEvent(event);
  if (!targetChip || targetChip === draggingChip) return;
  if (!isReorderEnabled(targetChip)) return;

  event.preventDefault();

  const bounds = targetChip.getBoundingClientRect();
  const placeAfter = event.clientX > bounds.left + bounds.width / 2;
  panelContent.insertBefore(draggingChip, placeAfter ? targetChip.nextSibling : targetChip);
  clearDropIndicators();
  emitReorderIfPossible();
};

const handleDragEnd = (): void => {
  if (draggingChip) {
    draggingChip.classList.remove('dragging');
    draggingChip = null;
  }
  clearDropIndicators();
};

document.addEventListener('click', handleDocumentClick);
document.addEventListener('dragstart', handleDragStart);
document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
document.addEventListener('dragend', handleDragEnd);
