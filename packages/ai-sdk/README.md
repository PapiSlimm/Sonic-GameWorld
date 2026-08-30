# @sonic-gameworld/ai-sdk

AI orchestrator types and a deterministic mock command parser for the Sonic GameWorld OS AI
pipeline (docs/CONTRACTS.md §8: `AI → Tool → Permission → Validation → Execution → Event`).

## Install

```bash
pnpm add @sonic-gameworld/ai-sdk
```

## Usage

```ts
import { parseCommandMock, validateToolCall } from '@sonic-gameworld/ai-sdk';

const plan = parseCommandMock('spawn 3 enemies near building 7');
// [{ tool: 'spawn_npc', args: { archetype: 'enemy', count: 3, placement: { relation: 'NEAR', anchor: 'building 7' } } }]

for (const call of plan) {
  const result = validateToolCall(call); // zod-validates args against AI_TOOL_SCHEMAS
  if (result.ok) {
    // hand off to the API's AI executor
  }
}
```

`parseCommandMock` is the same deterministic English parser described for the `mock`
`AIProvider` in CONTRACTS.md §8 — it needs no API key and produces stable output, so it is safe
to use in tests and offline demos. It understands (non-exhaustive):

- `"spawn N enemies|npcs|guards|zombies near/behind/... <entity>"` → `spawn_npc`
- `"follow player N"` / `"track <name>"` → `track_entity`
- `"start the storm|rain|snow|fog"` → `set_weather`
- `"set time to <n>|night|dawn|noon"` → `set_time_of_day`
- `"create a cinematic shot of <x>"` → `create_cinematic`
- `"make this area a boss arena"` → `create_trigger` + `modify_entity`
- `"create a zombie outbreak in <place>"` → multi-tool plan (`spawn_npc` ×2, `set_weather`, `create_trigger`)
- `"add civilians, police, gangs and autonomous vehicles"` → multiple `spawn_npc` calls
- `"make it an extraction game"` → `create_quest` + `create_trigger`
- `"publish it"` → `publish_asset`

Anything unrecognized returns an empty plan (`[]`) rather than throwing.

## Env vars

None.

## Public API

- `parseCommandMock(text, ctx?): ToolCall[]` — `ctx?: { anchorName?: string; worldName?: string }`.
- Re-exported from `@sonic-gameworld/world-schema`: `AIToolNameSchema`, `AIToolName`,
  `AI_TOOL_NAMES`, `AIAgentRoleSchema`, `AIAgentRole`, `AI_AGENT_ROLES`, `AIPermissionSchema`,
  `AIPermission`, `AI_TOOL_SCHEMAS`, `AIToolArgs`, `AI_TOOL_DEFINITIONS`, `AIToolDefinition`,
  `ToolCallSchema`, `ToolCall`, `validateToolCall`, `PlacementSchema`, `Placement`.

## Build & test

```bash
pnpm --filter @sonic-gameworld/ai-sdk build
pnpm --filter @sonic-gameworld/ai-sdk test
```
