import { Badge, Panel } from '@sonic-gameworld/ui';
import { CodeBlock } from '../../../components/code-block';

const INSTALL = `// Package Manager → Add package from git URL:
https://github.com/sonic-gameworld/unity-sdk.git#v1

// or add to Packages/manifest.json:
"com.sonicgameworld.sdk": "https://github.com/sonic-gameworld/unity-sdk.git#v1"`;

const INIT = `using SonicGameWorld;

var config = new GameWorldConfig {
    BaseUrl = "https://api.sonicgameworld.dev",
    ApiKey = "gw_live_...", // from Developer Portal → API Keys
};
var client = new GameWorldClient(config);

var session = await client.Auth.DevLoginAsync("you@studio.dev"); // non-production only
client.SetToken(session.Tokens.AccessToken);`;

const WORLD = `var world = await client.Worlds.GetAsync(worldId);
var document = await client.Worlds.GetDocumentAsync(worldId);

var loader = GetComponent<GameWorldSceneLoader>();
loader.LoadWorld(document); // instantiates entities, NPCs, terrain from the WorldDocument`;

const AI = `var result = await client.Ai.CommandAsync(new AiCommandInput {
    WorldId = worldId,
    Text = "spawn 3 enemies near building 7",
    Mode = AiAgentRole.Builder,
});
Debug.Log(result.Narration);`;

export default function UnitySdkPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-text">Unity SDK</h1>
        <Badge tone="accent">v1 · UPM package</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        A C# client mirroring the Web SDK's surface, plus a <code className="font-hud text-accent">GameWorldSceneLoader</code>{' '}
        component that turns a <code className="font-hud text-accent">WorldDocument</code> into live GameObjects (entities,
        NPCs, terrain, lights) using the same engine-agnostic schema the Studio editor authors.
      </p>

      <Panel title="Install (Unity Package Manager)"><CodeBlock lang="text" code={INSTALL} /></Panel>
      <Panel title="Initialize"><CodeBlock lang="C#" code={INIT} /></Panel>
      <Panel title="Load a world into the scene"><CodeBlock lang="C#" code={WORLD} /></Panel>
      <Panel title="AI Director command"><CodeBlock lang="C#" code={AI} /></Panel>
    </div>
  );
}
