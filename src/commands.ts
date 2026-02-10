export const COMMAND_PIN = 'notebookPins.pinInCurrentNotebook';
export const COMMAND_UNPIN = 'notebookPins.unpinFromCurrentNotebook';
export const COMMAND_OPEN_PINNED = 'notebookPins.openPinnedNote';
const NOTE_LIST_CONTEXT_MENU = 'noteListContextMenu';

interface CommandHandlers {
  onPinSelected: () => Promise<void>;
  onUnpinSelected: () => Promise<void>;
  onOpenPinned: (noteId: string) => Promise<void>;
}

export const registerCommandsAndMenus = async (
  joplin: any,
  handlers: CommandHandlers,
): Promise<void> => {
  await joplin.commands.register({
    name: COMMAND_PIN,
    label: 'Pin in this notebook',
    execute: handlers.onPinSelected,
  });

  await joplin.commands.register({
    name: COMMAND_UNPIN,
    label: 'Unpin from this notebook',
    execute: handlers.onUnpinSelected,
  });

  await joplin.commands.register({
    name: COMMAND_OPEN_PINNED,
    label: 'Open pinned note',
    execute: async (noteId: unknown) => {
      if (typeof noteId !== 'string' || noteId.length === 0) return;
      await handlers.onOpenPinned(noteId);
    },
  });

  await joplin.views.menuItems.create(
    'notebookPins.pinInNotebook.menu',
    COMMAND_PIN,
    NOTE_LIST_CONTEXT_MENU,
  );
  await joplin.views.menuItems.create(
    'notebookPins.unpinFromNotebook.menu',
    COMMAND_UNPIN,
    NOTE_LIST_CONTEXT_MENU,
  );
};
