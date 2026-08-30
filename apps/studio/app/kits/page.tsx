import { AppShell } from '../../components/shell/AppShell';
import { KitsGallery } from '../../components/kits/KitsGallery';

export default function KitsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-col gap-1">
          <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent2">Game Kits</p>
          <h1 className="text-2xl font-semibold text-text">Start from a proven template</h1>
          <p className="max-w-2xl text-sm text-muted">One-click starters for common genres — pre-wired spawns, objectives, and volumes you can customize immediately.</p>
        </div>
        <KitsGallery />
      </div>
    </AppShell>
  );
}
