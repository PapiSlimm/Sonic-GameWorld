'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@sonic-gameworld/ui';
import { AppShell } from '../components/shell/AppShell';
import { AIPromptBox } from '../components/home/AIPromptBox';
import { NewWorldDialog } from '../components/home/NewWorldDialog';
import { ProjectsGrid } from '../components/home/ProjectsGrid';

export default function HomePage() {
  const [newWorldOpen, setNewWorldOpen] = useState(false);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
        <div className="flex flex-col gap-1">
          <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Sonic GameWorld OS</p>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold text-text">Your Projects</h1>
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setNewWorldOpen(true)}>
              New World
            </Button>
          </div>
          <p className="max-w-2xl text-sm text-muted">
            GameWorld Studio — build, direct, and publish interactive worlds. The world is the editor.
          </p>
        </div>

        <AIPromptBox />

        <ProjectsGrid />
      </div>
      <NewWorldDialog open={newWorldOpen} onClose={() => setNewWorldOpen(false)} />
    </AppShell>
  );
}
