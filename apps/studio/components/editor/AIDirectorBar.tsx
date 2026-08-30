'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { Badge, Button, cn } from '@sonic-gameworld/ui';
import { useStudioStore, type LogEntry } from '../../lib/store';
import { useSpeechRecognition } from '../../lib/speech';

const QUICK_PROMPTS = [
  'Follow Player 17',
  'Spawn an enemy squad behind the building',
  'Start the storm',
  'Create a cinematic shot of the city',
  'Make this area a boss arena',
];

const KIND_BADGE: Record<LogEntry['kind'], { tone: 'violet' | 'accent' | 'danger' | 'warn' | 'info' | 'default'; label: string }> = {
  plan: { tone: 'violet', label: 'PLAN' },
  executed: { tone: 'accent', label: 'TOOL' },
  denied: { tone: 'danger', label: 'DENIED' },
  narration: { tone: 'info', label: 'DIRECTOR' },
  system: { tone: 'default', label: 'SYSTEM' },
};

export interface AIDirectorBarProps {
  mode: string;
  onSubmit: (text: string) => void;
}

export function AIDirectorBar({ mode, onSubmit }: AIDirectorBarProps) {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(true);
  const aiBusy = useStudioStore((s) => s.aiBusy);
  const log = useStudioStore((s) => s.executionLog);
  const clearLog = useStudioStore((s) => s.clearLog);
  const logRef = useRef<HTMLDivElement>(null);

  const { supported, listening, start, stop } = useSpeechRecognition((transcript, isFinal) => {
    setText(transcript);
    if (isFinal) {
      onSubmit(transcript);
      setText('');
    }
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);

  const send = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col border-t border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 font-hud text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          Execution Log
          {log.length > 0 && <Badge tone="default">{log.length}</Badge>}
        </button>
        <div className="flex items-center gap-3">
          <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-muted">
            AI Director · <span className="text-accent2">{mode}</span>
          </span>
          {log.length > 0 && (
            <button type="button" onClick={clearLog} className="text-[10px] text-muted hover:text-text">
              Clear
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div ref={logRef} className="max-h-40 overflow-y-auto px-4 py-2">
          {log.length === 0 ? (
            <p className="py-2 text-xs text-muted">
              Talk to the AI Director below, or try a quick prompt — plans, tool calls, and denials will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {log.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-xs">
                  <Badge tone={KIND_BADGE[entry.kind].tone} className="mt-0.5 shrink-0">
                    {KIND_BADGE[entry.kind].label}
                  </Badge>
                  <span className={cn('text-text/85', entry.kind === 'denied' && 'text-danger/90', entry.kind === 'narration' && 'italic text-info/90')}>
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto px-4 pt-2 pb-1">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => send(p)}
            className="shrink-0 whitespace-nowrap rounded-full border border-border bg-bg px-3 py-1 text-xs text-muted transition-colors hover:border-accent2/50 hover:text-accent2"
          >
            {p}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 px-4 pb-3 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <button
          type="button"
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          disabled={!supported}
          onClick={() => (listening ? stop() : start())}
          title={supported ? 'Voice command (Web Speech API)' : 'Voice input not supported in this browser'}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border transition-colors',
            listening ? 'border-danger/60 bg-danger/10 text-danger' : 'bg-bg text-muted hover:text-accent',
            !supported && 'cursor-not-allowed opacity-40',
          )}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent2/70" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={listening ? 'Listening…' : `Tell the AI Director what to do (${mode.toLowerCase()})…`}
            className="h-10 w-full rounded-control border border-border bg-bg pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-accent2 focus:outline-none focus:ring-1 focus:ring-accent2/50"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={aiBusy || !text.trim()} loading={aiBusy} leftIcon={!aiBusy ? <Send className="h-4 w-4" /> : undefined}>
          Send
        </Button>
        {aiBusy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent2" aria-hidden />}
      </form>
    </div>
  );
}
