import { describe, expect, test, vi } from 'vitest';
import { NotebookPinsPanel } from '../../src/panel';

describe('panel wiring', () => {
  test('renders and forwards valid panel actions to host', async () => {
    const setHtml = vi.fn(async () => undefined);

    const panelAdapter = {
      create: vi.fn(async () => 'handle-1'),
      setHtml,
      onMessage: vi.fn(async (_handle: string, _cb: (message: unknown) => Promise<void>) => undefined),
    };

    const onAction = vi.fn(async () => undefined);
    const panel = new NotebookPinsPanel(panelAdapter, onAction);

    await panel.init();
    expect(panelAdapter.create).toHaveBeenCalledWith('notebookPins.panel');
    expect(setHtml).toHaveBeenCalledTimes(1);

    await panel.render({
      folderId: 'folderA',
      folderName: 'Folder A',
      title: 'Pinned in "Folder A"',
      emptyMessage: 'Right-click a note -> Pin in this notebook.',
      pins: [],
      capabilities: { reorder: false },
    });
    expect(setHtml).toHaveBeenCalledTimes(2);

    const messageCb = panelAdapter.onMessage.mock.calls[0]?.[1] as
      | ((message: unknown) => Promise<void>)
      | undefined;
    expect(messageCb).toBeTruthy();
    if (!messageCb) {
      throw new Error('Expected panel onMessage callback.');
    }

    await messageCb({ type: 'OPEN_NOTE', noteId: 'note1' });
    await messageCb({ type: 'UNPIN_NOTE', noteId: 'note2', folderId: 'folderA' });
    await messageCb({ type: 'REORDER_PINS', noteIdsInOrder: ['note3', 'note4'] });
    await messageCb({ type: 'UNKNOWN' });

    expect(onAction).toHaveBeenCalledTimes(3);
    expect(onAction).toHaveBeenNthCalledWith(1, { type: 'OPEN_NOTE', noteId: 'note1' });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      type: 'UNPIN_NOTE',
      noteId: 'note2',
      folderId: 'folderA',
    });
    expect(onAction).toHaveBeenNthCalledWith(3, {
      type: 'REORDER_PINS',
      noteIdsInOrder: ['note3', 'note4'],
    });
  });
});
