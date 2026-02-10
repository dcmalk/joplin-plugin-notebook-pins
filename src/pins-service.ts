import { createEmptyState, sanitizeState } from './storage';
import { PinnedNote, PinsState } from './types';

export interface NoteEntity {
  id: string;
  title?: string;
  parent_id?: string;
  is_todo?: number;
  todo_completed?: number;
}

export interface NotesAdapter {
  getNote(noteId: string): Promise<NoteEntity | null>;
  openNote(noteId: string): Promise<void>;
}

export interface PinsRepository {
  loadState(): Promise<PinsState>;
  saveState(state: PinsState): Promise<void>;
  getMaxPins(): Promise<number>;
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

  async unpinNoteEverywhere(noteId: string): Promise<boolean> {
    const existingFolderId = this.state.noteToFolderIndex[noteId];
    if (existingFolderId) {
      const changed = this.removePinInternal(noteId, existingFolderId);
      if (changed) await this.persist();
      return changed;
    }

    let changed = false;
    for (const folderId of Object.keys(this.state.pinsByFolderId)) {
      changed = this.removePinInternal(noteId, folderId) || changed;
    }
    if (changed) await this.persist();
    return changed;
  }

  async listPinnedNotes(folderId: string): Promise<PinnedNote[]> {
    const noteIds = this.getPinnedIds(folderId);
    if (noteIds.length === 0) return [];

    const notes: PinnedNote[] = [];
    const staleNoteIds: string[] = [];

    for (const noteId of noteIds) {
      const note = await this.notesAdapter.getNote(noteId);
      if (!note || note.parent_id !== folderId) {
        staleNoteIds.push(noteId);
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
    if (!note || note.parent_id !== folderId) {
      const changed = this.removePinInternal(noteId, folderId);
      if (changed) await this.persist();
    }
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

  private async persist(): Promise<void> {
    this.state = sanitizeState(this.state);
    this.state.updatedAt = Date.now();
    await this.repository.saveState(this.state);
  }
}
