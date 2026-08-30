'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@sonic-gameworld/ui';

export function CodeBlock({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to fall back to */
    }
  };

  return (
    <div className={cn('group relative overflow-hidden rounded-control border border-border bg-bg', className)}>
      {lang && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="font-hud text-[10px] uppercase tracking-wider text-muted">{lang}</span>
        </div>
      )}
      <button
        type="button"
        onClick={copy}
        className={cn(
          'absolute right-2 top-2 z-10 flex items-center gap-1 rounded-control border border-border bg-panel/80 px-2 py-1 text-[10px] text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100',
          !lang && 'top-2',
        )}
      >
        {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-text/90">
        <code className="font-hud">{code}</code>
      </pre>
    </div>
  );
}
