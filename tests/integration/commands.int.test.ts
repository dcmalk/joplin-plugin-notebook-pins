import { describe, expect, test, vi } from 'vitest';
import {
  COMMAND_OPEN_PINNED,
  COMMAND_PIN,
  COMMAND_UNPIN,
  registerCommandsAndMenus,
} from '../../src/commands';

describe('commands wiring', () => {
  test('registers commands and note list menu items', async () => {
    const registered: Array<{ name: string; execute: (...args: unknown[]) => Promise<void> }> = [];
    const menuItems: Array<{ id: string; commandName: string; location: string }> = [];

    const joplinMock = {
      commands: {
        register: vi.fn(async (command: { name: string; execute: (...args: unknown[]) => Promise<void> }) => {
          registered.push(command);
        }),
      },
      views: {
        menuItems: {
          create: vi.fn(async (id: string, commandName: string, location: string) => {
            menuItems.push({ id, commandName, location });
          }),
        },
      },
    };

    const onPinSelected = vi.fn(async () => undefined);
    const onUnpinSelected = vi.fn(async () => undefined);
    const onOpenPinned = vi.fn(async (_noteId: string) => undefined);

    await registerCommandsAndMenus(joplinMock, {
      onPinSelected,
      onUnpinSelected,
      onOpenPinned,
    });

    expect(registered.map((c) => c.name)).toEqual([COMMAND_PIN, COMMAND_UNPIN, COMMAND_OPEN_PINNED]);
    expect(menuItems.map((m) => m.commandName)).toEqual([COMMAND_PIN, COMMAND_UNPIN]);

    const openCommand = registered.find((command) => command.name === COMMAND_OPEN_PINNED);
    expect(openCommand).toBeDefined();
    await openCommand?.execute('noteA');
    await openCommand?.execute('');
    expect(onOpenPinned).toHaveBeenCalledTimes(1);
    expect(onOpenPinned).toHaveBeenCalledWith('noteA');
  });
});
