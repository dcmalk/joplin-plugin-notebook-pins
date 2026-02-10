import joplin from 'api';
import { SettingItemType } from 'api/types';
import {
  COMMAND_OPEN_PINNED,
  registerCommandsAndMenus,
} from './commands';
import { registerWorkspaceEvents } from './events';
import { NoteEntity, PinsService } from './pins-service';
import { NotebookPinsPanel } from './panel';
import {
  MAX_PINS_SETTING_KEY,
  SettingsStateRepository,
  STATE_SETTING_KEY,
} from './storage';
import { PanelAction, PanelRenderModel } from './types';

const SETTINGS_SECTION = 'notebookPins';

const showUserMessage = async (message: string): Promise<void> => {
  try {
    await joplin.views.dialogs.showMessageBox(message);
  } catch {
    console.info(message);
  }
};

const getSelectedFolder = async (): Promise<{ id: string; title: string } | null> => {
  const folder = await joplin.workspace.selectedFolder();
  if (!folder || typeof folder.id !== 'string') return null;
  return {
    id: folder.id,
    title: typeof folder.title === 'string' ? folder.title : 'Notebook',
  };
};

const getPrimarySelectedNoteId = async (): Promise<string | null> => {
  const noteIds = await joplin.workspace.selectedNoteIds();
  if (Array.isArray(noteIds) && noteIds.length > 0 && typeof noteIds[0] === 'string') {
    return noteIds[0];
  }

  const selected = await joplin.workspace.selectedNote();
  if (selected && typeof selected.id === 'string') return selected.id;
  return null;
};

const createNotesAdapter = () => ({
  getNote: async (noteId: string): Promise<NoteEntity | null> => {
    try {
      return (await joplin.data.get(['notes', noteId], {
        fields: ['id', 'title', 'parent_id', 'is_todo', 'todo_completed'],
      })) as NoteEntity;
    } catch {
      return null;
    }
  },
  openNote: async (noteId: string): Promise<void> => {
    await joplin.commands.execute('openNote', noteId);
  },
});

joplin.plugins.register({
  onStart: async () => {
    await joplin.settings.registerSection(SETTINGS_SECTION, {
      label: 'Notebook Pins',
      iconName: 'fas fa-thumbtack',
    });

    await joplin.settings.registerSettings({
      [STATE_SETTING_KEY]: {
        public: false,
        section: SETTINGS_SECTION,
        type: SettingItemType.String,
        value: '',
        label: 'Notebook pin state',
      },
      [MAX_PINS_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Int,
        value: 0,
        label: 'Max pins per notebook',
        description: 'Set to 0 for unlimited.',
      },
    });

    const repository = new SettingsStateRepository({
      value: async (key: string) => joplin.settings.value(key),
      setValue: async (key: string, value: unknown) => joplin.settings.setValue(key, value),
    });
    const notesAdapter = createNotesAdapter();
    const service = new PinsService(repository, notesAdapter);
    await service.init();
    let refreshPanel: () => Promise<void> = async () => {};

    const panel = new NotebookPinsPanel(joplin.views.panels, async (action: PanelAction) => {
      if (action.type === 'OPEN_NOTE') {
        await joplin.commands.execute(COMMAND_OPEN_PINNED, action.noteId);
        return;
      }

      if (action.type === 'UNPIN_NOTE') {
        const folder = await getSelectedFolder();
        if (!folder) return;
        await service.unpinNote(action.noteId, folder.id);
        await refreshPanel();
        return;
      }

      if (action.type === 'REORDER_PINS') {
        await showUserMessage('Reordering is planned for v1.1.');
      }
    });

    await panel.init();

    refreshPanel = async (): Promise<void> => {
      try {
        const folder = await getSelectedFolder();
        if (!folder) {
          const model: PanelRenderModel = {
            folderId: null,
            folderName: null,
            title: 'Pinned notes',
            emptyMessage: 'Select a notebook to view pinned notes.',
            pins: [],
            capabilities: { reorder: false },
          };
          await panel.render(model);
          return;
        }

        const pinnedNotes = await service.listPinnedNotes(folder.id);
        const model: PanelRenderModel = {
          folderId: folder.id,
          folderName: folder.title,
          title: `Pinned in "${folder.title}"`,
          emptyMessage: 'Right-click a note -> Pin in this notebook.',
          pins: pinnedNotes,
          capabilities: { reorder: false },
        };
        await panel.render(model);
      } catch (error) {
        const model: PanelRenderModel = {
          folderId: null,
          folderName: null,
          title: 'Pinned notes',
          emptyMessage: 'Unable to render pinned notes right now.',
          pins: [],
          capabilities: { reorder: false },
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        await panel.render(model);
      }
    };

    await registerCommandsAndMenus(joplin, {
      onPinSelected: async () => {
        const folder = await getSelectedFolder();
        const noteId = await getPrimarySelectedNoteId();
        if (!folder || !noteId) {
          await showUserMessage('Select a note in a notebook before pinning.');
          return;
        }

        const note = await notesAdapter.getNote(noteId);
        if (!note) {
          await showUserMessage('The selected note is not available.');
          return;
        }

        if (note.parent_id !== folder.id) {
          await showUserMessage('You can only pin notes that belong to the current notebook.');
          return;
        }

        const result = await service.pinNote(noteId, folder.id);
        if (result.message) await showUserMessage(result.message);
        await refreshPanel();
      },
      onUnpinSelected: async () => {
        const folder = await getSelectedFolder();
        const noteId = await getPrimarySelectedNoteId();
        if (!folder || !noteId) {
          await showUserMessage('Select a note in a notebook before unpinning.');
          return;
        }

        const result = await service.unpinNote(noteId, folder.id);
        if (result.message) await showUserMessage(result.message);
        await refreshPanel();
      },
      onOpenPinned: async (noteId: string) => {
        await service.openPinnedNote(noteId);
      },
    });

    await registerWorkspaceEvents(joplin, {
      refresh: refreshPanel,
      handleNoteChange: async (noteId: string) => {
        await service.handleNoteChange(noteId);
      },
    });

    await refreshPanel();
  },
});
