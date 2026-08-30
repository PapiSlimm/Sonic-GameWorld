'use client';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge, Panel, Tabs } from '@sonic-gameworld/ui';
import { CodeBlock } from '../../components/code-block';
import { API_BASE_URL } from '../../lib/client';
import { QUICKSTART_DOMAINS } from '../../lib/quickstart';

const DOCS_URL = `${API_BASE_URL}/docs`;

export default function DocsPage() {
  const [iframeFailed, setIframeFailed] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">API Documentation</h1>
        <p className="text-sm text-muted">Live OpenAPI explorer plus a REST quickstart with curl and TypeScript examples.</p>
      </div>

      <Tabs defaultValue="explorer">
        <Tabs.List>
          <Tabs.Trigger value="explorer">OpenAPI Explorer</Tabs.Trigger>
          <Tabs.Trigger value="quickstart">REST Quickstart</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="explorer">
          <Panel padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="font-hud text-[11px] uppercase tracking-wider text-muted">{DOCS_URL}</span>
              <a href={DOCS_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent hover:underline">
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {iframeFailed ? (
              <div className="p-6 text-sm text-muted">
                Couldn&apos;t load <span className="font-hud text-text/80">{DOCS_URL}</span> — the API isn&apos;t reachable from this
                browser right now. Start <code className="font-hud text-accent">services/api</code> and reload, or browse the{' '}
                <button type="button" className="text-accent underline" onClick={() => setIframeFailed(false)}>quickstart tab</button> instead.
              </div>
            ) : (
              <iframe
                src={DOCS_URL}
                title="OpenAPI explorer"
                className="h-[70vh] w-full bg-white"
                onError={() => setIframeFailed(true)}
              />
            )}
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="quickstart">
          <Tabs defaultValue={QUICKSTART_DOMAINS[0]!.key}>
            <Tabs.List className="flex-wrap">
              {QUICKSTART_DOMAINS.map((d) => (
                <Tabs.Trigger key={d.key} value={d.key}>{d.label}</Tabs.Trigger>
              ))}
            </Tabs.List>
            {QUICKSTART_DOMAINS.map((domain) => (
              <Tabs.Content key={domain.key} value={domain.key}>
                <div className="flex flex-col gap-4">
                  {domain.examples.map((ex) => (
                    <Panel key={`${ex.method}-${ex.path}`} title={
                      <span className="flex items-center gap-2">
                        <Badge tone={ex.method === 'GET' ? 'info' : ex.method === 'DELETE' ? 'danger' : 'accent'}>{ex.method}</Badge>
                        <span className="font-hud text-xs text-text/90">{ex.path}</span>
                      </span>
                    }>
                      <p className="mb-3 text-sm text-muted">{ex.summary}</p>
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <CodeBlock lang="curl" code={ex.curl} />
                        <CodeBlock lang="TypeScript" code={ex.ts} />
                      </div>
                    </Panel>
                  ))}
                </div>
              </Tabs.Content>
            ))}
          </Tabs>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
