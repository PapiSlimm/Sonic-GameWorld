'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@sonic-gameworld/ui';

const PLACEHOLDER = 'Build me a 10 km cyberpunk city with a flooded downtown and a rooftop racing circuit…';

export function AIPromptBox() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');

  const go = () => {
    if (!prompt.trim()) return;
    router.push(`/ai/generate?prompt=${encodeURIComponent(prompt.trim())}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex flex-col gap-3 rounded-panel border border-accent2/30 bg-[radial-gradient(circle_at_top_left,rgba(124,92,255,0.12),transparent_55%)] p-5"
    >
      <div className="flex items-center gap-2 font-hud text-[11px] uppercase tracking-[0.2em] text-accent2">
        <Sparkles className="h-4 w-4" />
        Generate a world with AI
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={2}
        className="w-full resize-none rounded-control border border-border bg-bg p-3 text-sm text-text placeholder:text-muted focus:border-accent2 focus:outline-none focus:ring-1 focus:ring-accent2/50"
      />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={!prompt.trim()} leftIcon={<Sparkles className="h-4 w-4" />}>
          Generate World
        </Button>
      </div>
    </form>
  );
}
