import {
  COMMAND_OPEN_PINNED,
  registerCommandsAndMenus,
} from './commands';
import { registerWorkspaceEvents } from './events';
import { NoteEntity, PinsService } from './pins-service';
import { NotebookPinsPanel } from './panel';
import {
  AUTO_MIGRATE_ON_MOVE_SETTING_KEY,
  MAX_PINS_SETTING_KEY,
  SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY,
  SettingsStateRepository,
  STATE_SETTING_KEY,
} from './storage';
import { PanelAction, PanelRenderModel } from './types';

declare const joplin: any;

const resolveJoplinApi = (): any => {
  if (typeof joplin !== 'undefined' && joplin) return joplin;

  const globalJoplin = (globalThis as { joplin?: unknown }).joplin;
  if (globalJoplin && typeof globalJoplin === 'object') return globalJoplin;

  try {
    const apiModule = require('api');
    return apiModule?.default ?? apiModule;
  } catch {
    throw new Error(
      'Notebook Pins could not resolve the Joplin plugin API. Check development plugin loading configuration.',
    );
  }
};

const joplinApi = resolveJoplinApi();

const SettingItemType = {
  // Joplin SettingItemType enum values:
  // Int=1, String=2, Bool=3
  Int: 1,
  String: 2,
  Bool: 3,
} as const;

const SETTINGS_SECTION = 'notebookPins';

const showUserMessage = async (message: string): Promise<void> => {
  try {
    await joplinApi.views.dialogs.showMessageBox(message);
  } catch {
    console.info(message);
  }
};

const getSelectedFolder = async (): Promise<{ id: string; title: string } | null> => {
  const folder = await joplinApi.workspace.selectedFolder();
  if (!folder || typeof folder.id !== 'string') return null;
  return {
    id: folder.id,
    title: typeof folder.title === 'string' ? folder.title : 'Notebook',
  };
};

const getPrimarySelectedNoteId = async (): Promise<string | null> => {
  const noteIds = await joplinApi.workspace.selectedNoteIds();
  if (Array.isArray(noteIds) && noteIds.length > 0 && typeof noteIds[0] === 'string') {
    return noteIds[0];
  }

  const selected = await joplinApi.workspace.selectedNote();
  if (selected && typeof selected.id === 'string') return selected.id;
  return null;
};

const isUnsupportedSettingsEventError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('property or method') && message.includes('does not exist');
};

const createNotesAdapter = () => ({
  getNote: async (noteId: string): Promise<NoteEntity | null> => {
    try {
      return (await joplinApi.data.get(['notes', noteId], {
        fields: ['id', 'title', 'parent_id', 'is_todo', 'todo_completed', 'deleted_time'],
      })) as NoteEntity;
    } catch {
      return null;
    }
  },
  openNote: async (noteId: string): Promise<void> => {
    await joplinApi.commands.execute('openNote', noteId);
  },
});

joplinApi.plugins.register({
  onStart: async () => {
    await joplinApi.settings.registerSection(SETTINGS_SECTION, {
      label: 'Notebook Pins',
      iconName: 'fas fa-thumbtack',
    });

    await joplinApi.settings.registerSettings({
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
      [AUTO_MIGRATE_ON_MOVE_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Bool,
        value: false,
        label: 'Auto-migrate pins when notes move notebooks',
      },
      [SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY]: {
        public: true,
        section: SETTINGS_SECTION,
        type: SettingItemType.Bool,
        value: false,
        label: 'Show horizontal scrollbar in pinned strip',
      },
    });

    const repository = new SettingsStateRepository({
      value: async (key: string) => joplinApi.settings.value(key),
      setValue: async (key: string, value: unknown) => joplinApi.settings.setValue(key, value),
    });
    const notesAdapter = createNotesAdapter();
    const service = new PinsService(repository, notesAdapter);
    await service.init();
    let refreshPanel: () => Promise<void> = async () => {};

    const panel = new NotebookPinsPanel(joplinApi.views.panels, async (action: PanelAction) => {
      if (action.type === 'OPEN_NOTE') {
        await joplinApi.commands.execute(COMMAND_OPEN_PINNED, action.noteId);
        return;
      }

      if (action.type === 'UNPIN_NOTE') {
        await service.unpinNote(action.noteId, action.folderId);
        await refreshPanel();
        return;
      }

      if (action.type === 'REORDER_PINS') {
        await service.reorderPins(action.folderId, action.noteIdsInOrder);
        await refreshPanel();
      }
    });

    await panel.init();

    refreshPanel = async (): Promise<void> => {
      try {
        await service.reconcilePins();

        const folder = await getSelectedFolder();
        if (!folder) {
          const model: PanelRenderModel = {
            folderId: null,
            folderName: null,
            title: 'PINNED',
            emptyMessage: 'Select a notebook to view pinned notes.',
            showHorizontalScrollbar: false,
            pins: [],
            capabilities: { reorder: false },
          };
          await panel.render(model);
          return;
        }

        const [pinnedNotes, showHorizontalScrollbar] = await Promise.all([
          service.listPinnedNotes(folder.id),
          repository.getShowHorizontalScrollbar(),
        ]);
        const model: PanelRenderModel = {
          folderId: folder.id,
          folderName: folder.title,
          title: 'PINNED',
          emptyMessage: 'Right-click a note → Pin in this notebook.',
          showHorizontalScrollbar,
          pins: pinnedNotes,
          capabilities: { reorder: true },
        };
        await panel.render(model);
      } catch (error) {
        const model: PanelRenderModel = {
          folderId: null,
          folderName: null,
          title: 'PINNED',
          emptyMessage: 'Unable to render pinned notes right now.',
          showHorizontalScrollbar: false,
          pins: [],
          capabilities: { reorder: false },
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        await panel.render(model);
      }
    };

    await registerCommandsAndMenus(joplinApi, {
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

    await registerWorkspaceEvents(joplinApi, {
      refresh: refreshPanel,
      handleNoteChange: async (noteId: string) => {
        await service.handleNoteChange(noteId);
      },
    });

    if (typeof joplinApi.settings?.onChange === 'function') {
      try {
        await joplinApi.settings.onChange(async (event: { keys?: string[] }) => {
          const changedKeys = Array.isArray(event?.keys) ? event.keys : [];
          if (
            changedKeys.length === 0 ||
            changedKeys.includes(SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY)
          ) {
            await refreshPanel();
          }
        });
      } catch (error) {
        if (!isUnsupportedSettingsEventError(error)) {
          throw error;
        }
      }
    }

    await refreshPanel();
  },
});
