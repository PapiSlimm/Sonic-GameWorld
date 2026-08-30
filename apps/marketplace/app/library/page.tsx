import { LibraryView } from '../../src/components/library/LibraryView.js';

export default function LibraryPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Library</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Your library</h1>
        <p className="mt-1 text-sm text-muted">Purchased worlds, games and assets, ready to download or open in GameWorld Studio.</p>
      </div>
      <LibraryView />
    </div>
  );
}
