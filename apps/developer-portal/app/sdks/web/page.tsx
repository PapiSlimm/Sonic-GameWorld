import { Badge, Panel } from '@sonic-gameworld/ui';
import { CodeBlock } from '../../../components/code-block';

const INSTALL = `pnpm add @sonic-gameworld/gameworld-sdk
# or: npm install @sonic-gameworld/gameworld-sdk`;

const INIT = `import { createClient } from '@sonic-gameworld/gameworld-sdk';

export const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  // Either a user JWT (from auth.dev / auth.firebase / auth.refresh)...
  token: myStoredJwt,
  // ...or a server/SDK API key created in the Developer Portal → API Keys.
  apiKey: process.env.GAMEWORLD_API_KEY,
});`;

const WORLDS = `const { items: worlds } = await client.worlds.list({ limit: 20 });

const world = await client.worlds.create({ name: 'Frontier Outpost Alpha', genre: ['SCIFI'] });
await client.worlds.putDocument(world.id, myWorldDocument);
await client.worlds.publish(world.id);`;

const REALTIME = `const handle = client.connectRealtime(['world:' + world.id], (msg) => {
  console.log(msg.topic, msg.type, msg.payload);
});
// handle.send({ op: 'SUBSCRIBE', topic: 'session:' + sessionId });
// handle.close();`;

const ERRORS = `import { ApiError } from '@sonic-gameworld/gameworld-sdk';

try {
  await client.worlds.get('nope');
} catch (err) {
  if (err instanceof ApiError) {
    console.error(err.status, err.code, err.message, err.details);
  }
}`;

export default function WebSdkPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-text">Web SDK</h1>
        <Badge tone="success">Stable</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        <code className="font-hud text-accent">@sonic-gameworld/gameworld-sdk</code> is a typed fetch client for
        the GameWorld API (Node 20+ and modern browsers). It's the same client every first-party app (studio,
        marketplace, player, creator, admin) uses.
      </p>

      <Panel title="Install"><CodeBlock lang="bash" code={INSTALL} /></Panel>
      <Panel title="Initialize"><CodeBlock lang="TypeScript" code={INIT} /></Panel>
      <Panel title="Worlds"><CodeBlock lang="TypeScript" code={WORLDS} /></Panel>
      <Panel title="Realtime (WebSocket)"><CodeBlock lang="TypeScript" code={REALTIME} /></Panel>
      <Panel title="Error handling"><CodeBlock lang="TypeScript" code={ERRORS} /></Panel>
    </div>
  );
}
