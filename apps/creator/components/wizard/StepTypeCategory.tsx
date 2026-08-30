'use client';
import { Box, Globe2 } from 'lucide-react';
import { Panel, Select, cn } from '@sonic-gameworld/ui';
import { PRODUCT_CATEGORIES } from '@sonic-gameworld/world-schema';
import { useWizardStore } from '../../lib/wizard-store';

const CATEGORY_LABEL: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  WORLD: 'World',
  GAME_KIT: 'Game kit',
  SYSTEM: 'System',
  AI_AGENT: 'AI agent',
  CHARACTER: 'Character',
  VEHICLE: 'Vehicle',
  ENVIRONMENT: 'Environment',
  CINEMATIC: 'Cinematic',
  MISSION: 'Mission',
  EXPERIENCE: 'Experience',
};

export function StepTypeCategory() {
  const { form, setKind, setCategory } = useWizardStore();

  return (
    <Panel title="1. Type & category">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 font-hud text-[11px] uppercase tracking-wider text-muted">What are you publishing?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setKind('ASSET')}
              className={cn(
                'flex items-start gap-3 rounded-panel border p-4 text-left transition-colors',
                form.kind === 'ASSET' ? 'border-accent bg-accent/10 shadow-glow' : 'border-border hover:border-accent/40',
              )}
            >
              <Box className="h-5 w-5 shrink-0 text-accent" />
              <span>
                <span className="block text-sm font-medium text-text">Digital asset</span>
                <span className="block text-xs text-muted">Upload a model, texture, audio, NPC, mission, or other file-backed asset.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setKind('WORLD')}
              className={cn(
                'flex items-start gap-3 rounded-panel border p-4 text-left transition-colors',
                form.kind === 'WORLD' ? 'border-accent bg-accent/10 shadow-glow' : 'border-border hover:border-accent/40',
              )}
            >
              <Globe2 className="h-5 w-5 shrink-0 text-accent" />
              <span>
                <span className="block text-sm font-medium text-text">Published world</span>
                <span className="block text-xs text-muted">List one of your existing GameWorld Studio worlds on the marketplace.</span>
              </span>
            </button>
          </div>
        </div>

        <Select
          label="Marketplace category"
          placeholder="Select a category…"
          value={form.category ?? ''}
          onChange={(e) => setCategory(e.target.value as (typeof PRODUCT_CATEGORIES)[number])}
          options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
        />
      </div>
    </Panel>
  );
}

export function isStepTypeCategoryValid(): boolean {
  const { form } = useWizardStore.getState();
  return form.category !== null;
}
