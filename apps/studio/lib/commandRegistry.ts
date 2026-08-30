'use client';

import { create } from 'zustand';
import type { CommandItem } from '@sonic-gameworld/ui';

interface CommandRegistryState {
  contexts: Record<string, CommandItem[]>;
  aiSubmit: ((text: string) => void) | null;
  registerCommands: (key: string, items: CommandItem[]) => void;
  unregisterCommands: (key: string) => void;
  setAiSubmit: (fn: ((text: string) => void) | null) => void;
}

export const useCommandRegistry = create<CommandRegistryState>((set) => ({
  contexts: {},
  aiSubmit: null,
  registerCommands: (key, items) => set((s) => ({ contexts: { ...s.contexts, [key]: items } })),
  unregisterCommands: (key) =>
    set((s) => {
      const next = { ...s.contexts };
      delete next[key];
      return { contexts: next };
    }),
  setAiSubmit: (fn) => set({ aiSubmit: fn }),
}));

export function allRegisteredCommands(contexts: Record<string, CommandItem[]>): CommandItem[] {
  return Object.values(contexts).flat();
}
