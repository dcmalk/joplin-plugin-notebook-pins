import { describe, expect, test } from 'vitest';
import { PinsService } from '../../src/pins-service';
import { createEmptyState } from '../../src/storage';
import { PinsState } from '../../src/types';

class MemoryRepo {
  public state: PinsState = createEmptyState();
  public maxPins = 0;

  async loadState(): Promise<PinsState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  async saveState(state: PinsState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state));
  }

  async getMaxPins(): Promise<number> {
    return this.maxPins;
  }
}

describe('PinsService', () => {
  test('pins and unpins notes in notebook context', async () => {
    const repo = new MemoryRepo();
    const notes = {
      note1: { id: 'note1', parent_id: 'folderA', title: 'One' },
    };
    const service = new PinsService(repo, {
      getNote: async (noteId) => notes[noteId as keyof typeof notes] ?? null,
      openNote: async () => undefined,
    });
    await service.init();

    const pinResult = await service.pinNote('note1', 'folderA');
    expect(pinResult.changed).toBe(true);
    expect(service.getPinnedIds('folderA')).toEqual(['note1']);

    const unpinResult = await service.unpinNote('note1', 'folderA');
    expect(unpinResult.changed).toBe(true);
    expect(service.getPinnedIds('folderA')).toEqual([]);
  });

  test('enforces max pins per notebook', async () => {
    const repo = new MemoryRepo();
    repo.maxPins = 1;
    const notes = {
      note1: { id: 'note1', parent_id: 'folderA', title: 'One' },
      note2: { id: 'note2', parent_id: 'folderA', title: 'Two' },
    };
    const service = new PinsService(repo, {
      getNote: async (noteId) => notes[noteId as keyof typeof notes] ?? null,
      openNote: async () => undefined,
    });
    await service.init();

    await service.pinNote('note1', 'folderA');
    const result = await service.pinNote('note2', 'folderA');

    expect(result.changed).toBe(false);
    expect(result.message).toContain('maximum');
    expect(service.getPinnedIds('folderA')).toEqual(['note1']);
  });

  test('listPinnedNotes removes stale pins for moved notes', async () => {
    const repo = new MemoryRepo();
    const notes = {
      note1: { id: 'note1', parent_id: 'folderB', title: 'Moved' },
    };
    const service = new PinsService(repo, {
      getNote: async (noteId) => notes[noteId as keyof typeof notes] ?? null,
      openNote: async () => undefined,
    });
    await service.init();
    await service.pinNote('note1', 'folderA');

    const pinned = await service.listPinnedNotes('folderA');
    expect(pinned).toEqual([]);
    expect(service.getPinnedIds('folderA')).toEqual([]);
  });
});
