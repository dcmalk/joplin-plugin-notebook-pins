import { PinsState } from './types';

export const STATE_SETTING_KEY = 'notebookPins.state';
export const MAX_PINS_SETTING_KEY = 'notebookPins.maxPinsPerNotebook';
export const AUTO_MIGRATE_ON_MOVE_SETTING_KEY = 'notebookPins.autoMigrateOnMove';
export const SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY = 'notebookPins.showHorizontalScrollbar';

export interface SettingsAdapter {
  value(key: string): Promise<unknown>;
  setValue(key: string, value: unknown): Promise<void>;
}

const STATE_VERSION = 1 as const;

export const createEmptyState = (now = Date.now()): PinsState => ({
  version: STATE_VERSION,
  pinsByFolderId: {},
  noteToFolderIndex: {},
  updatedAt: now,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseUnknownState = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw;
  if (raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const sanitizeState = (
  input: Partial<PinsState> | Record<string, unknown> | null | undefined,
): PinsState => {
  const source = isRecord(input) ? input : {};
  const pinsByFolderId: Record<string, string[]> = {};
  const noteToFolderIndex: Record<string, string> = {};

  if (isRecord(source.pinsByFolderId)) {
    for (const [folderId, maybeNoteIds] of Object.entries(source.pinsByFolderId)) {
      if (!isValidId(folderId) || !Array.isArray(maybeNoteIds)) continue;

      const cleaned: string[] = [];
      for (const noteId of maybeNoteIds) {
        if (!isValidId(noteId)) continue;
        if (noteToFolderIndex[noteId]) continue;
        noteToFolderIndex[noteId] = folderId;
        cleaned.push(noteId);
      }

      if (cleaned.length > 0) {
        pinsByFolderId[folderId] = cleaned;
      }
    }
  }

  const updatedAt =
    typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
      ? source.updatedAt
      : Date.now();

  return {
    version: STATE_VERSION,
    pinsByFolderId,
    noteToFolderIndex,
    updatedAt,
  };
};

export const parseStoredState = (raw: unknown): PinsState => {
  const parsed = parseUnknownState(raw);
  if (!isRecord(parsed)) return createEmptyState();

  const candidateVersion = parsed.version;
  if (candidateVersion === STATE_VERSION || 'pinsByFolderId' in parsed) {
    return sanitizeState(parsed as Partial<PinsState>);
  }

  return createEmptyState();
};

export const normalizeMaxPins = (raw: unknown): number => {
  const numberValue =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN;

  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
};

export const normalizeBooleanSetting = (raw: unknown): boolean => {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw !== 'string') return false;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return false;
};

export class SettingsStateRepository {
  constructor(private readonly settings: SettingsAdapter) {}

  async loadState(): Promise<PinsState> {
    const raw = await this.settings.value(STATE_SETTING_KEY);
    return parseStoredState(raw);
  }

  async saveState(state: PinsState): Promise<void> {
    const sanitized = sanitizeState(state);
    sanitized.updatedAt = Date.now();
    await this.settings.setValue(STATE_SETTING_KEY, JSON.stringify(sanitized));
  }

  async getMaxPins(): Promise<number> {
    const raw = await this.settings.value(MAX_PINS_SETTING_KEY);
    return normalizeMaxPins(raw);
  }

  async getAutoMigrateOnMove(): Promise<boolean> {
    const raw = await this.settings.value(AUTO_MIGRATE_ON_MOVE_SETTING_KEY);
    return normalizeBooleanSetting(raw);
  }

  async getShowHorizontalScrollbar(): Promise<boolean> {
    const raw = await this.settings.value(SHOW_HORIZONTAL_SCROLLBAR_SETTING_KEY);
    return normalizeBooleanSetting(raw);
  }
}
