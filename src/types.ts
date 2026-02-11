export interface PinsState {
  version: 1;
  pinsByFolderId: Record<string, string[]>;
  noteToFolderIndex: Record<string, string>;
  updatedAt: number;
}

export interface PinnedNote {
  noteId: string;
  title: string;
  isTodo: boolean;
  todoCompleted: boolean;
}

export interface PanelRenderModel {
  folderId: string | null;
  folderName: string | null;
  title: string;
  emptyMessage: string;
  pins: PinnedNote[];
  capabilities: {
    reorder: boolean;
  };
  error?: string;
}

export type PanelAction =
  | { type: 'OPEN_NOTE'; noteId: string }
  | { type: 'UNPIN_NOTE'; noteId: string; folderId: string }
  | { type: 'REORDER_PINS'; noteIdsInOrder: string[] };
