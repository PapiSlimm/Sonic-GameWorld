'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ensureSession, getClient } from '../../../lib/client';
import { createOfflineWorld } from '../../../lib/offlineStore';
import { parseWorldPrompt } from '../../../lib/promptParse';

const STEPS = ['Interpreting prompt', 'Laying out terrain & districts', 'Populating entities', 'Finalizing world document'];

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get('prompt') ?? '';
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prompt) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    const stepTimer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 450);

    async function run() {
      const fields = parseWorldPrompt(prompt);
      const online = await ensureSession();
      if (cancelled) return;
      if (online) {
        try {
          const world = await getClient().worlds.create({ name: fields.name, description: fields.description, genre: fields.genre, sizeKm2: fields.sizeKm2 });
          if (!cancelled) router.replace(`/worlds/${world.id}`);
          return;
        } catch {
          // fall through to offline generation
        }
      }
      try {
        const doc = createOfflineWorld(fields);
        if (!cancelled) router.replace(`/worlds/${doc.id}`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate world');
      }
    }

    void run();
    return () => {
      cancelled = true;
      clearInterval(stepTimer);
    };
  }, [prompt, router]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 p-16 text-center">
      <Sparkles className="h-10 w-10 animate-gw-pulse text-accent2" />
      <h1 className="text-xl font-semibold text-text">Generating your world</h1>
      <p className="text-sm text-muted">&ldquo;{prompt}&rdquo;</p>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="flex flex-col gap-2 text-left">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 text-xs">
              {i < step ? (
                <span className="h-3.5 w-3.5 rounded-full bg-success" />
              ) : i === step ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-border" />
              )}
              <span className={i <= step ? 'text-text/85' : 'text-muted'}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AIGeneratePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex h-full items-center justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>}>
        <GenerateContent />
      </Suspense>
    </AppShell>
  );
}
