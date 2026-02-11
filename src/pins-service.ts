import { createEmptyState, sanitizeState } from './storage';
import { PinnedNote, PinsState } from './types';

export interface NoteEntity {
  id: string;
  title?: string;
  parent_id?: string;
  is_todo?: number;
  todo_completed?: number;
  deleted_time?: number;
}

export interface NotesAdapter {
  getNote(noteId: string): Promise<NoteEntity | null>;
  openNote(noteId: string): Promise<void>;
}

export interface PinsRepository {
  loadState(): Promise<PinsState>;
  saveState(state: PinsState): Promise<void>;
  getMaxPins(): Promise<number>;
  getAutoMigrateOnMove(): Promise<boolean>;
}

export interface PinResult {
  changed: boolean;
  message?: string;
}

export class PinsService {
  private state: PinsState = createEmptyState();

  constructor(
    private readonly repository: PinsRepository,
    private readonly notesAdapter: NotesAdapter,
  ) {}

  async init(): Promise<void> {
    this.state = sanitizeState(await this.repository.loadState());
    await this.repository.saveState(this.state);
  }

  getPinnedIds(folderId: string): string[] {
    const pins = this.state.pinsByFolderId[folderId];
    return pins ? [...pins] : [];
  }

  getStateSnapshot(): PinsState {
    return JSON.parse(JSON.stringify(this.state)) as PinsState;
  }

  async pinNote(noteId: string, folderId: string): Promise<PinResult> {
    if (!noteId || !folderId) return { changed: false, message: 'Missing note or notebook context.' };

    const existingFolderId = this.state.noteToFolderIndex[noteId];
    if (existingFolderId === folderId) {
      return { changed: false, message: 'This note is already pinned in this notebook.' };
    }

    const maxPins = await this.repository.getMaxPins();
    const currentPins = this.state.pinsByFolderId[folderId] ?? [];
    if (maxPins > 0 && currentPins.length >= maxPins) {
      return {
        changed: false,
        message: `This notebook already has the maximum of ${maxPins} pins.`,
      };
    }

    if (existingFolderId) {
      this.removePinInternal(noteId, existingFolderId);
    }

    if (!this.state.pinsByFolderId[folderId]) {
      this.state.pinsByFolderId[folderId] = [];
    }

    this.state.pinsByFolderId[folderId].push(noteId);
    this.state.noteToFolderIndex[noteId] = folderId;
    await this.persist();

    return { changed: true };
  }

  async unpinNote(noteId: string, folderId: string): Promise<PinResult> {
    if (!noteId || !folderId) return { changed: false, message: 'Missing note or notebook context.' };
    const changed = this.removePinInternal(noteId, folderId);
    if (!changed) return { changed: false };

    await this.persist();
    return { changed: true };
  }

  async reorderPins(folderId: string, noteIdsInOrder: string[]): Promise<PinResult> {
    if (!folderId) return { changed: false, message: 'Missing notebook context.' };
    if (!Array.isArray(noteIdsInOrder) || noteIdsInOrder.length === 0) {
      return { changed: false, message: 'No pinned notes to reorder.' };
    }

    const current = this.state.pinsByFolderId[folderId] ?? [];
    if (current.length === 0) return { changed: false, message: 'No pinned notes to reorder.' };

    const uniqueRequested = [...new Set(noteIdsInOrder)];
    if (uniqueRequested.length !== noteIdsInOrder.length) {
      return { changed: false, message: 'Invalid reorder payload.' };
    }

    if (uniqueRequested.length !== current.length) {
      return { changed: false, message: 'Invalid reorder payload.' };
    }

    const currentSet = new Set(current);
    if (!uniqueRequested.every((noteId) => currentSet.has(noteId))) {
      return { changed: false, message: 'Invalid reorder payload.' };
    }

    const orderUnchanged = current.every((noteId, index) => noteId === uniqueRequested[index]);
    if (orderUnchanged) return { changed: false };

    this.state.pinsByFolderId[folderId] = uniqueRequested;
    await this.persist();
    return { changed: true };
  }

  async listPinnedNotes(folderId: string): Promise<PinnedNote[]> {
    const noteIds = this.getPinnedIds(folderId);
    if (noteIds.length === 0) return [];

    const notes: PinnedNote[] = [];
    const staleNoteIds: string[] = [];
    const migratedNoteIds: Array<{ noteId: string; toFolderId: string }> = [];
    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();

    for (const noteId of noteIds) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!isLiveNote(note) || typeof note.parent_id !== 'string' || note.parent_id.length === 0) {
        staleNoteIds.push(noteId);
        continue;
      }
      if (note.parent_id !== folderId) {
        if (autoMigrateOnMove) {
          migratedNoteIds.push({ noteId, toFolderId: note.parent_id });
        } else {
          staleNoteIds.push(noteId);
        }
        continue;
      }

      notes.push({
        noteId,
        title: note.title || '(Untitled)',
        isTodo: Boolean(note.is_todo),
        todoCompleted: Boolean(note.todo_completed),
      });
    }

    if (staleNoteIds.length > 0) {
      for (const staleNoteId of staleNoteIds) {
        this.removePinInternal(staleNoteId, folderId);
      }
    }
    if (migratedNoteIds.length > 0) {
      for (const migration of migratedNoteIds) {
        this.movePinInternal(migration.noteId, folderId, migration.toFolderId);
      }
    }
    if (staleNoteIds.length > 0 || migratedNoteIds.length > 0) {
      await this.persist();
    }

    return notes;
  }

  async openPinnedNote(noteId: string): Promise<void> {
    await this.notesAdapter.openNote(noteId);
  }

  async handleNoteChange(noteId: string): Promise<void> {
    const folderId = this.state.noteToFolderIndex[noteId];
    if (!folderId) return;

    const note = await this.notesAdapter.getNote(noteId);
    if (!isLiveNote(note) || typeof note.parent_id !== 'string' || note.parent_id.length === 0) {
      const changed = this.removePinInternal(noteId, folderId);
      if (changed) await this.persist();
      return;
    }

    if (note.parent_id === folderId) return;

    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();
    if (!autoMigrateOnMove) {
      const changed = this.removePinInternal(noteId, folderId);
      if (changed) await this.persist();
      return;
    }

    const changed = this.movePinInternal(noteId, folderId, note.parent_id);
    if (changed) {
      await this.persist();
    }
  }

  async reconcilePins(): Promise<void> {
    const indexEntries = Object.entries(this.state.noteToFolderIndex);
    if (indexEntries.length === 0) return;

    const autoMigrateOnMove = await this.repository.getAutoMigrateOnMove();
    let changed = false;

    for (const [noteId, folderId] of indexEntries) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!isLiveNote(note) || typeof note.parent_id !== 'string' || note.parent_id.length === 0) {
        changed = this.removePinInternal(noteId, folderId) || changed;
        continue;
      }

      if (note.parent_id === folderId) continue;
      if (!autoMigrateOnMove) {
        changed = this.removePinInternal(noteId, folderId) || changed;
        continue;
      }

      changed = this.movePinInternal(noteId, folderId, note.parent_id) || changed;
    }

    if (changed) await this.persist();
  }

  private removePinInternal(noteId: string, folderId: string): boolean {
    const noteIds = this.state.pinsByFolderId[folderId];
    if (!noteIds) return false;

    const next = noteIds.filter((id) => id !== noteId);
    if (next.length === noteIds.length) return false;

    if (next.length > 0) {
      this.state.pinsByFolderId[folderId] = next;
    } else {
      delete this.state.pinsByFolderId[folderId];
    }

    if (this.state.noteToFolderIndex[noteId] === folderId) {
      delete this.state.noteToFolderIndex[noteId];
    }

    return true;
  }

  private movePinInternal(noteId: string, fromFolderId: string, toFolderId: string): boolean {
    if (!toFolderId || fromFolderId === toFolderId) return false;

    const removed = this.removePinInternal(noteId, fromFolderId);
    if (!removed) return false;

    if (!this.state.pinsByFolderId[toFolderId]) {
      this.state.pinsByFolderId[toFolderId] = [];
    }

    if (!this.state.pinsByFolderId[toFolderId].includes(noteId)) {
      this.state.pinsByFolderId[toFolderId].push(noteId);
    }

    this.state.noteToFolderIndex[noteId] = toFolderId;
    return true;
  }

  private async persist(): Promise<void> {
    this.state = sanitizeState(this.state);
    this.state.updatedAt = Date.now();
    await this.repository.saveState(this.state);
  }
}

const isLiveNote = (note: NoteEntity | null): note is NoteEntity => {
  if (!note) return false;
  return !(typeof note.deleted_time === 'number' && note.deleted_time > 0);
};
