interface EventHandlers {
  refresh: () => Promise<void>;
  handleNoteChange: (noteId: string) => Promise<void>;
}

const debounce = (callback: () => void, waitMs: number): (() => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(callback, waitMs);
  };
};

export const registerWorkspaceEvents = async (
  joplin: any,
  handlers: EventHandlers,
): Promise<void> => {
  const debouncedRefresh = debounce(() => {
    void handlers.refresh();
  }, 150);

  await joplin.workspace.onNoteSelectionChange(async () => {
    debouncedRefresh();
  });

  if (typeof joplin.workspace.onFolderSelectionChange === 'function') {
    await joplin.workspace.onFolderSelectionChange(async () => {
      await handlers.refresh();
    });
  }

  if (typeof joplin.workspace.onNoteChange === 'function') {
    await joplin.workspace.onNoteChange(async (event: { id?: string }) => {
      if (event && typeof event.id === 'string') {
        await handlers.handleNoteChange(event.id);
      }
      debouncedRefresh();
    });
  }

  if (typeof joplin.workspace.onSyncComplete === 'function') {
    await joplin.workspace.onSyncComplete(async () => {
      debouncedRefresh();
    });
  }
};
