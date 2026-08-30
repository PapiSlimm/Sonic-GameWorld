'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Home, LayoutGrid, Package } from 'lucide-react';
import { CommandPalette, useCommandPalette, type CommandItem } from '@sonic-gameworld/ui';
import { allRegisteredCommands, useCommandRegistry } from '../../lib/commandRegistry';

/** Mounted once in the root layout: Cmd/Ctrl+K opens it anywhere in the app. */
export function GlobalCommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const contexts = useCommandRegistry((s) => s.contexts);
  const aiSubmit = useCommandRegistry((s) => s.aiSubmit);

  const navItems: CommandItem[] = useMemo(
    () => [
      { id: 'nav-home', label: 'Go to Projects', group: 'Navigate', icon: <Home className="h-4 w-4" />, onSelect: () => router.push('/') },
      { id: 'nav-forge', label: 'WorldForge', group: 'Navigate', icon: <Compass className="h-4 w-4" />, onSelect: () => router.push('/forge') },
      { id: 'nav-kits', label: 'Game Kits', group: 'Navigate', icon: <Package className="h-4 w-4" />, onSelect: () => router.push('/kits') },
      { id: 'nav-generate', label: 'AI Generate a World', group: 'Navigate', icon: <LayoutGrid className="h-4 w-4" />, onSelect: () => router.push('/ai/generate') },
    ],
    [router],
  );

  const items = useMemo(() => [...navItems, ...allRegisteredCommands(contexts)], [navItems, contexts]);

  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      placeholder="Jump to a page, run a command, or talk to the AI Director…"
      onSubmitText={aiSubmit ?? undefined}
      freeTextLabel="Send to AI Director"
    />
  );
}
