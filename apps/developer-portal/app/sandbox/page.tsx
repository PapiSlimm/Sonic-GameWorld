'use client';
import { useState } from 'react';
import { Play, TriangleAlert } from 'lucide-react';
import { ApiError } from '@sonic-gameworld/gameworld-sdk';
import { Badge, Button, Panel } from '@sonic-gameworld/ui';
import { CodeBlock } from '../../components/code-block';
import { getClient } from '../../lib/client';
import { loadSession } from '../../lib/session';
import { SANDBOX_DEMO_RESPONSES, SANDBOX_PRESETS, type SandboxPreset } from '../../lib/sandbox';

interface ResultState {
  status: 'ok' | 'error' | 'demo';
  statusCode?: number;
  durationMs: number;
  body: unknown;
}

const METHOD_TONE = { GET: 'info', POST: 'accent', PATCH: 'warn', PUT: 'warn', DELETE: 'danger' } as const;

export default function SandboxPage() {
  const [preset, setPreset] = useState<SandboxPreset>(SANDBOX_PRESETS[0]!);
  const [bodyText, setBodyText] = useState(preset.defaultBody);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const selectPreset = (p: SandboxPreset) => {
    setPreset(p);
    setBodyText(p.defaultBody);
    setResult(null);
    setJsonError(null);
  };

  const send = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = bodyText.trim() ? JSON.parse(bodyText) : {};
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }

    setSending(true);
    const started = performance.now();
    try {
      const body = await preset.run(getClient(), parsed);
      setResult({ status: 'ok', statusCode: 200, durationMs: Math.round(performance.now() - started), body });
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({ status: 'error', statusCode: err.status, durationMs: Math.round(performance.now() - started), body: { error: { code: err.code, message: err.message, details: err.details } } });
      } else {
        // API unreachable entirely — fall back to a canned demo response so the sandbox stays usable offline.
        setResult({ status: 'demo', durationMs: Math.round(performance.now() - started), body: SANDBOX_DEMO_RESPONSES[preset.id] ?? { note: 'No demo response registered for this preset.' } });
      }
    } finally {
      setSending(false);
    }
  };

  const hasSession = !!loadSession()?.token;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Sandbox</h1>
        <p className="text-sm text-muted">
          Send real requests through <code className="font-hud text-accent">gameworld-sdk</code> and inspect the response.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <Panel padded={false} className="h-fit">
          <div className="flex flex-col gap-0.5 p-2">
            {SANDBOX_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p)}
                className={`flex items-center gap-2 rounded-control px-2.5 py-2 text-left text-xs transition-colors ${
                  p.id === preset.id ? 'bg-bg text-accent shadow-glow' : 'text-text/70 hover:bg-bg hover:text-text'
                }`}
              >
                <Badge tone={METHOD_TONE[p.method]} className="shrink-0">{p.method}</Badge>
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={METHOD_TONE[preset.method]}>{preset.method}</Badge>
                <span className="font-hud text-sm text-text">{preset.path}</span>
              </div>
              <div className="flex items-center gap-2">
                {preset.requiresAuth && (
                  <Badge tone={hasSession ? 'success' : 'warn'} title={hasSession ? 'Bearer token attached' : 'Sign in from the top bar for a real result'}>
                    {hasSession ? 'Authenticated' : 'Needs sign-in'}
                  </Badge>
                )}
                <Button size="sm" leftIcon={<Play className="h-3.5 w-3.5" />} loading={sending} onClick={send}>Send</Button>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">{preset.description}</p>
          </Panel>

          <Panel title="Request body / query">
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full resize-y rounded-control border border-border bg-bg p-3 font-hud text-xs text-text/90 outline-none focus:border-accent/50"
            />
            {jsonError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
                <TriangleAlert className="h-3.5 w-3.5" /> {jsonError}
              </p>
            )}
          </Panel>

          <Panel
            title="Response"
            actions={result ? (
              <div className="flex items-center gap-2">
                <Badge tone={result.status === 'ok' ? 'success' : result.status === 'demo' ? 'warn' : 'danger'}>
                  {result.status === 'ok' ? `${result.statusCode} OK` : result.status === 'demo' ? 'Demo (API unreachable)' : `${result.statusCode ?? 'Error'}`}
                </Badge>
                <span className="font-hud text-[10px] text-muted">{result.durationMs}ms</span>
              </div>
            ) : undefined}
          >
            {result ? (
              <CodeBlock lang="JSON" code={JSON.stringify(result.body, null, 2)} />
            ) : (
              <p className="text-sm text-muted">Send a request to see the response here.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
