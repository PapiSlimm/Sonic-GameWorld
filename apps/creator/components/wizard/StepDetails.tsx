'use client';
import { Input, Panel, cn } from '@sonic-gameworld/ui';
import { ENGINE_TARGETS, GENRES } from '@sonic-gameworld/world-schema';
import { useWizardStore } from '../../lib/wizard-store';

export function StepDetails() {
  const { form, setDetails, toggleGenre, toggleEngine } = useWizardStore();

  return (
    <Panel title="3. Details">
      <div className="flex flex-col gap-4">
        <Input label="Name" placeholder="e.g. Neon Tokyo 2099" value={form.name} onChange={(e) => setDetails({ name: e.target.value })} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setDetails({ description: e.target.value })}
            rows={4}
            placeholder="What is it, and why should a creator buy it?"
            className="w-full rounded-control border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </label>

        <div>
          <p className="mb-2 font-hud text-[11px] uppercase tracking-wider text-muted">Genre</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  form.genre.includes(g) ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-hud text-[11px] uppercase tracking-wider text-muted">Engine targets</p>
          <div className="flex flex-wrap gap-2">
            {ENGINE_TARGETS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleEngine(e)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  form.engines.includes(e) ? 'border-accent2 bg-accent2/15 text-accent2' : 'border-border text-muted hover:text-text',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Specs (optional)</span>
          <textarea
            value={form.specs}
            onChange={(e) => setDetails({ specs: e.target.value })}
            rows={3}
            placeholder="Poly count, texture resolution, LODs, dependencies, min. engine version…"
            className="w-full rounded-control border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="text-xs text-muted">Appended to the listing&apos;s long description — there is no dedicated specs field in the API yet.</span>
        </label>
      </div>
    </Panel>
  );
}
