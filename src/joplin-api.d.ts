declare module 'api' {
  const joplin: any;
  export default joplin;
}

declare module 'api/types' {
  export enum MenuItemLocation {
    NoteListContextMenu = 'noteListContextMenu',
  }

  export enum SettingItemType {
    Int = 'int',
    String = 'string',
    Bool = 'bool',
  }
}
