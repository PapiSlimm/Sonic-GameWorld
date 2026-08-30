import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RtsPlayClient } from './RtsPlayClient';

export const metadata: Metadata = {
  title: 'RTS — GameWorld Play',
};

// `RtsPlayClient` reads `?join=<sessionId>` via `useSearchParams()`, which Next.js requires a
// Suspense boundary around (otherwise the whole route opts into fully client-side rendering).
function RtsPlayFallback() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 px-4 py-24 text-muted">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
    </main>
  );
}

export default async function RtsPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<RtsPlayFallback />}>
      <RtsPlayClient gameId={id} />
    </Suspense>
  );
}
