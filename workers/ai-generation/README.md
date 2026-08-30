# @sonic-gameworld/worker-ai-generation

BullMQ worker for queue `ai.generate`. Handles the generative half of the AI tool pipeline
(CONTRACTS.md §8: `AI → Tool → Permission → Validation → Execution → Event`) — heavier/slower
content-generation tool calls (`generate_asset` foremost) that `services/api`'s synchronous
`POST /ai/command` orchestrator shouldn't block a request on. Permission and validation for the
requesting tool call happen in `services/api` before a job reaches this queue; this worker owns
Execution and always finishes with an `AIExecution` row + `AI_TOOL_EXECUTED` event.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-ai-generation dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-ai-generation build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-ai-generation start  # node dist/index.js
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` |
| `AI_GENERATION_WORKER_CONCURRENCY` | `2` | BullMQ concurrency |
| `AI_GENERATION_PROVIDER` | `mock` | `anthropic`\|`gemini`\|`mock` — see fallback behavior below |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (`claude-3-5-sonnet-latest`) | — | Used when `AI_GENERATION_PROVIDER=anthropic` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-1.5-pro`) | — | Used when `AI_GENERATION_PROVIDER=gemini` |
| `LOG_LEVEL` | `info` | pino level |

## Job payload

```ts
{
  worldId?: string; actorId?: string; orgId?: string;
  tool: AIToolName;       // 'generate_asset' is the primary use case, but the shape is generic
  role?: AIAgentRole;
  prompt: string;         // creator's natural-language brief
  args?: Record<string, unknown>;
}
```

**Wired.** The `generate_asset` AI tool (`services/api/src/modules/ai/tools/registry.ts`) enqueues
onto `ai.generate` via `app.queues.aiGenerate.add('generate', ...)` after creating the `Asset` row
and (when placed) its world entity — the tool call returns immediately with the asset id and
`asset.generation_queued` in its result flags; `GET /ai/executions/:id`
(`services/api/src/modules/ai/index.ts`) polls the `AIExecution` row this worker writes on
completion. The other 19 AI tools are unaffected — only `generate_asset` uses this queue.

## Public API

- `startWorker(config?)` / `processGenerateJob(job, deps)` — same shape as the other workers'
  equivalents; `processGenerateJob` is what the test suite drives directly.
- `resolveGenerationProvider(config)`, `mockGenerationProvider` (`src/providers/index.ts`).
- Provider classes: `AnthropicGenerationProvider`, `GeminiGenerationProvider` (`src/providers/*.ts`).

## Provider resolution & fallback (two layers, both real)

1. **Resolution** (`resolveGenerationProvider`): if `AI_GENERATION_PROVIDER=anthropic`/`gemini` but
   the matching API key isn't set, resolution silently returns the mock provider — no error, no
   partial config state.
2. **Call-time fallback** (`processGenerateJob`): if the resolved *real* provider's `generate()`
   call throws (network error, bad response, non-JSON reply that couldn't even be recovered by
   `parseGeneratedSpec`'s fence-stripping), the worker retries once against the mock provider and
   reports `provider: "<name>->mock-fallback"` in the result. A generation job only surfaces as an
   `ok: false` `AIExecution` if even the deterministic mock provider throws, which it's designed
   never to do.

Both real providers are prompted to return strict JSON (`{title, description, tags,
suggestedCategory, narration}`); `parseSpec.ts` strips markdown code fences and validates the
required fields are actually present before trusting the response.

## Tests

`pnpm --filter @sonic-gameworld/worker-ai-generation test` (vitest):

- `src/index.test.ts` — `processGenerateJob` end-to-end against an in-memory Prisma fake + event
  bus: asserts `AIExecution`/`AIUsage` rows and the `AI_TOOL_EXECUTED` event, that requesting a
  provider with no API key transparently resolves to mock, and that even an empty prompt still
  produces a complete, persisted result.
- `src/providers/mock.test.ts` — the mock provider is well-formed, deterministic, and
  category-guesses correctly from both prompt keywords and tool name.
- `src/providers/parseSpec.test.ts` — JSON extraction handles a clean response, a
  markdown-fenced response, and rejects a non-JSON or incomplete response.
