import { describe, expect, test, vi } from 'vitest';
import { registerWorkspaceEvents } from '../../src/events';

describe('workspace events wiring', () => {
  test('hooks workspace events and debounces refresh', async () => {
    vi.useFakeTimers();

    const joplinMock = {
      workspace: {
        onNoteSelectionChange: vi.fn(async (_cb: () => Promise<void>) => undefined),
        onFolderSelectionChange: vi.fn(async (_cb: () => Promise<void>) => undefined),
        onNoteChange: vi.fn(async (_cb: (event: { id?: string }) => Promise<void>) => undefined),
        onSyncComplete: vi.fn(async (_cb: () => Promise<void>) => undefined),
      },
    };

    const refresh = vi.fn(async () => undefined);
    const handleNoteChange = vi.fn(async (_noteId: string) => undefined);

    await registerWorkspaceEvents(joplinMock, { refresh, handleNoteChange });

    const noteSelectionCb = joplinMock.workspace.onNoteSelectionChange.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    const folderSelectionCb = joplinMock.workspace.onFolderSelectionChange.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    const noteChangeCb = joplinMock.workspace.onNoteChange.mock.calls[0]?.[0] as
      | ((event: { id?: string }) => Promise<void>)
      | undefined;
    const syncCompleteCb = joplinMock.workspace.onSyncComplete.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;

    expect(noteSelectionCb).toBeTruthy();
    expect(folderSelectionCb).toBeTruthy();
    expect(noteChangeCb).toBeTruthy();
    expect(syncCompleteCb).toBeTruthy();
    if (!noteSelectionCb || !folderSelectionCb || !noteChangeCb || !syncCompleteCb) {
      throw new Error('Expected callbacks to be registered.');
    }

    await folderSelectionCb();
    expect(refresh).toHaveBeenCalledTimes(1);

    await noteSelectionCb();
    await noteSelectionCb();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(149);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);

    await noteChangeCb({ id: 'note1' });
    expect(handleNoteChange).toHaveBeenCalledWith('note1');
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(3);

    await syncCompleteCb();
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  test('skips optional workspace events when runtime reports unsupported methods', async () => {
    const unsupported = vi.fn(async () => {
      throw new Error(
        'Property or method "onFolderSelectionChange" does not exist in "joplin.workspace.onFolderSelectionChange"',
      );
    });

    const joplinMock = {
      workspace: {
        onNoteSelectionChange: vi.fn(async (_cb: () => Promise<void>) => undefined),
        onFolderSelectionChange: unsupported,
        onNoteChange: vi.fn(async (_cb: (event: { id?: string }) => Promise<void>) => undefined),
        onSyncComplete: vi.fn(async (_cb: () => Promise<void>) => undefined),
      },
    };

    const refresh = vi.fn(async () => undefined);
    const handleNoteChange = vi.fn(async (_noteId: string) => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(registerWorkspaceEvents(joplinMock, { refresh, handleNoteChange })).resolves.toBeUndefined();
    expect(unsupported).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      'Notebook Pins: skipping unsupported workspace event "onFolderSelectionChange".',
    );

    infoSpy.mockRestore();
  });
});
