'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { AIAgentRole } from '@sonic-gameworld/gameworld-sdk';
import { CAMERA_MODES, type CameraMode } from '@sonic-gameworld/world-schema';
import { ArrowLeft, Clapperboard, Compass, Drama, Loader2, Map as MapIcon, ScrollText, UploadCloud } from 'lucide-react';
import { EmptyState, cn } from '@sonic-gameworld/ui';
import { useStudioStore } from '../../../lib/store';
import { useWorldSession } from '../../../lib/useWorldSession';
import { useAiDirector } from '../../../lib/useAiDirector';
import { useCommandRegistry } from '../../../lib/commandRegistry';
import { AIDirectorBar } from '../../../components/editor/AIDirectorBar';

const TABS: { segment: string; label: string; icon: typeof MapIcon; mode: AIAgentRole }[] = [
  { segment: '', label: 'Editor', icon: MapIcon, mode: 'BUILDER' },
  { segment: 'director', label: 'Director', icon: Clapperboard, mode: 'DIRECTOR' },
  { segment: 'missions', label: 'Missions', icon: ScrollText, mode: 'QUESTMASTER' },
  { segment: 'npcs', label: 'NPCs', icon: Drama, mode: 'NPC' },
  { segment: 'cinematics', label: 'Cinematics', icon: Compass, mode: 'CINEMATOGRAPHER' },
  { segment: 'publish', label: 'Publish', icon: UploadCloud, mode: 'PUBLISHER' },
];

export default function WorldLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  useWorldSession(id);

  const pathname = usePathname();
  const router = useRouter();
  const activeSegment = pathname?.split(`/worlds/${id}`)[1]?.split('/').filter(Boolean)[0] ?? '';
  const activeTab = TABS.find((t) => t.segment === activeSegment) ?? TABS[0]!;

  const document = useStudioStore((s) => s.document);
  const worldMeta = useStudioStore((s) => s.worldMeta);
  const loading = useStudioStore((s) => s.loading);
  const loadError = useStudioStore((s) => s.loadError);
  const cameraMode = useStudioStore((s) => s.cameraMode);
  const setCameraMode = useStudioStore((s) => s.setCameraMode);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const registerCommands = useCommandRegistry((s) => s.registerCommands);
  const unregisterCommands = useCommandRegistry((s) => s.unregisterCommands);

  const { submit } = useAiDirector({ worldId: id, mode: activeTab.mode });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    registerCommands('world-nav', [
      ...TABS.map((t) => ({
        id: `world-tab-${t.segment || 'editor'}`,
        label: `Go to ${t.label}`,
        group: 'This World',
        icon: <t.icon className="h-4 w-4" />,
        onSelect: () => router.push(`/worlds/${id}${t.segment ? `/${t.segment}` : ''}`),
      })),
      ...CAMERA_MODES.map((mode) => ({
        id: `camera-${mode}`,
        label: `Camera: ${mode.replace('_', ' ')}`,
        group: 'Camera',
        onSelect: () => setCameraMode(mode as CameraMode),
      })),
      { id: 'undo', label: 'Undo', group: 'Edit', shortcut: ['⌘', 'Z'], onSelect: () => undo() },
      { id: 'redo', label: 'Redo', group: 'Edit', shortcut: ['⌘', '⇧', 'Z'], onSelect: () => redo() },
    ]);
    return () => unregisterCommands('world-nav');
  }, [id, router, registerCommands, unregisterCommands, setCameraMode, undo, redo]);

  const tabHref = useMemo(() => (segment: string) => `/worlds/${id}${segment ? `/${segment}` : ''}`, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (loadError || !document) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg p-6">
        <EmptyState
          title="World unavailable"
          description={loadError ?? 'This world could not be loaded.'}
          action={
            <Link href="/" className="text-sm text-accent hover:underline">
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" />
            Projects
          </Link>
          <span className="h-4 w-px bg-border" />
          <span className="truncate font-hud text-sm font-semibold text-text">{worldMeta?.name ?? document.name}</span>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.segment || 'editor'}
              href={tabHref(tab.segment)}
              className={cn(
                'flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs transition-colors',
                tab === activeTab ? 'bg-bg text-accent' : 'text-muted hover:text-text',
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          ))}
        </nav>
        <div className="w-[92px]" aria-hidden />
      </header>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{children}</div>
        <div className="shrink-0">
          <AIDirectorBar mode={activeTab.mode} onSubmit={submit} />
        </div>
      </div>
    </div>
  );
}
