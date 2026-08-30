import { Badge, Panel } from '@sonic-gameworld/ui';
import { CodeBlock } from '../../../components/code-block';

const INSTALL = `# Add to <Project>/Plugins/GameWorldPlugin (git submodule or Fab download), then in <Project>.uproject:
"Plugins": [
  { "Name": "GameWorldPlugin", "Enabled": true }
]

# Regenerate project files and rebuild.`;

const INIT = `// In an editor or runtime module
#include "GameWorldSubsystem.h"

UGameWorldSubsystem* GW = GetGameInstance()->GetSubsystem<UGameWorldSubsystem>();
GW->Configure(TEXT("https://api.sonicgameworld.dev"), TEXT("gw_live_..."));

GW->OnCommandCompleted.AddDynamic(this, &AMyGameMode::HandleAiResult);`;

const BLUEPRINT = `// Blueprint nodes exposed by the plugin:
//   GameWorld: Load World         (WorldId) -> (Success, Document)
//   GameWorld: Send AI Command    (WorldId, Text, Mode) -> (Narration, Executed[])
//   GameWorld: Spawn Entity       (WorldId, EntityStruct) -> (EntityId)
//   GameWorld: Subscribe Realtime (Topic) -> (OnMessage event)
// All calls run async off the game thread and resume on the Blueprint's next tick.`;

const CPP = `FGameWorldAiCommandInput Input;
Input.WorldId = WorldId;
Input.Text = TEXT("start the storm");

GW->SendAiCommand(Input, FOnAiCommandComplete::CreateLambda([](const FGameWorldAiCommandResult& Result) {
    UE_LOG(LogTemp, Log, TEXT("Narration: %s"), *Result.Narration);
}));`;

export default function UnrealSdkPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-text">Unreal Plugin</h1>
        <Badge tone="warn">Beta</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        <code className="font-hud text-accent">GameWorldPlugin</code> wraps the API in a{' '}
        <code className="font-hud text-accent">UGameWorldSubsystem</code> with both a C++ interface and Blueprint
        nodes, so designers can wire AI Director commands and world loading without touching code.
      </p>

      <Panel title="Install (plugin)"><CodeBlock lang="text" code={INSTALL} /></Panel>
      <Panel title="Initialize (C++)"><CodeBlock lang="C++" code={INIT} /></Panel>
      <Panel title="Blueprint nodes"><CodeBlock lang="text" code={BLUEPRINT} /></Panel>
      <Panel title="AI Director command (C++)"><CodeBlock lang="C++" code={CPP} /></Panel>
    </div>
  );
}
