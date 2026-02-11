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

const isUnsupportedWorkspaceEventError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('property or method') && message.includes('does not exist');
};

const registerOptionalWorkspaceEvent = async (
  workspace: any,
  eventName: string,
  callback: (...args: any[]) => Promise<void>,
): Promise<void> => {
  const register = workspace?.[eventName];
  if (typeof register !== 'function') return;

  try {
    await register(callback);
  } catch (error) {
    if (isUnsupportedWorkspaceEventError(error)) {
      return;
    }
    throw error;
  }
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

  await registerOptionalWorkspaceEvent(
    joplin.workspace,
    'onFolderSelectionChange',
    async () => {
      await handlers.refresh();
    },
  );

  await registerOptionalWorkspaceEvent(
    joplin.workspace,
    'onNoteChange',
    async (event: { id?: string }) => {
      if (event && typeof event.id === 'string') {
        await handlers.handleNoteChange(event.id);
      }
      debouncedRefresh();
    },
  );

  await registerOptionalWorkspaceEvent(
    joplin.workspace,
    'onSyncComplete',
    async () => {
      debouncedRefresh();
    },
  );
};
