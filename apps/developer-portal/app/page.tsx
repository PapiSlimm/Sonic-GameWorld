'use client';
import Link from 'next/link';
import { ArrowRight, BookOpen, FlaskConical, KeyRound, Webhook as WebhookIcon, Blocks } from 'lucide-react';
import { Panel } from '@sonic-gameworld/ui';
import { CodeBlock } from '../components/code-block';
import { API_BASE_URL } from '../lib/client';

const SECTIONS = [
  { href: '/keys', label: 'API Keys', icon: KeyRound, description: 'Create and revoke gw_live_ keys. Secrets are shown once, at creation.' },
  { href: '/webhooks', label: 'Webhooks', icon: WebhookIcon, description: 'Subscribe to platform events, send test deliveries, inspect the delivery log.' },
  { href: '/docs', label: 'Docs', icon: BookOpen, description: 'Interactive OpenAPI explorer plus a REST quickstart with curl and TypeScript.' },
  { href: '/sdks', label: 'SDKs', icon: Blocks, description: 'Web SDK, Unity SDK and Unreal plugin — install steps and code samples.' },
  { href: '/sandbox', label: 'Sandbox', icon: FlaskConical, description: 'Build and send real API requests with gameworld-sdk, inspect the response live.' },
];

const QUICKSTART = `import { createClient } from '@sonic-gameworld/gameworld-sdk';

const client = createClient({ baseUrl: '${API_BASE_URL}' });
const { tokens, user } = await client.auth.dev({ email: 'you@studio.dev' });
client.setToken(tokens.accessToken);

const worlds = await client.worlds.list({ limit: 10 });
console.log(worlds.items);`;

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Sonic GameWorld OS</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Developer Portal</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everything you need to build against the GameWorld API: keys, webhooks, interactive docs, SDKs for
          Web/Unity/Unreal, and a live request sandbox.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition-colors hover:border-accent/50" padded>
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" aria-hidden />
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </div>
              <div className="mt-3 text-sm font-semibold text-text">{label}</div>
              <div className="mt-1 text-xs text-muted">{description}</div>
            </Panel>
          </Link>
        ))}
      </div>

      <Panel title="Quickstart">
        <p className="mb-3 text-sm text-muted">
          Install <code className="font-hud text-accent">@sonic-gameworld/gameworld-sdk</code> and make your first
          authenticated call:
        </p>
        <CodeBlock lang="TypeScript" code={QUICKSTART} />
      </Panel>
    </div>
  );
}
