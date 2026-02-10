import { describe, expect, test } from 'vitest';
import {
  createEmptyState,
  normalizeMaxPins,
  parseStoredState,
  sanitizeState,
} from '../../src/storage';

describe('storage', () => {
  test('createEmptyState returns versioned empty schema', () => {
    const state = createEmptyState(123);
    expect(state.version).toBe(1);
    expect(state.updatedAt).toBe(123);
    expect(state.pinsByFolderId).toEqual({});
    expect(state.noteToFolderIndex).toEqual({});
  });

  test('parseStoredState returns empty state for invalid payload', () => {
    const state = parseStoredState('{not-valid-json');
    expect(state.version).toBe(1);
    expect(state.pinsByFolderId).toEqual({});
  });

  test('sanitizeState deduplicates note IDs globally', () => {
    const state = sanitizeState({
      pinsByFolderId: {
        folderA: ['note1', 'note1', 'note2'],
        folderB: ['note2', 'note3'],
      },
      noteToFolderIndex: {},
      updatedAt: 1,
      version: 1,
    });

    expect(state.pinsByFolderId.folderA).toEqual(['note1', 'note2']);
    expect(state.pinsByFolderId.folderB).toEqual(['note3']);
    expect(state.noteToFolderIndex).toEqual({
      note1: 'folderA',
      note2: 'folderA',
      note3: 'folderB',
    });
  });

  test('normalizeMaxPins coerces invalid values to zero', () => {
    expect(normalizeMaxPins(undefined)).toBe(0);
    expect(normalizeMaxPins(-1)).toBe(0);
    expect(normalizeMaxPins('4')).toBe(4);
  });
});
