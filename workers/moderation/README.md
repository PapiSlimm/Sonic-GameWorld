# @sonic-gameworld/worker-moderation

BullMQ worker for queue `moderation.scan`. Runs the moderation pipeline (CONTRACTS.md §13):

```
MALWARE → AI_SAFETY → LICENSE → CONTENT_POLICY → HUMAN_REVIEW (when needed) → PUBLISH
```

Every stage is an independently testable `ModerationStage { name, run(ctx) }` (`src/stages/*.ts`).
Unlike `worker-asset-processing`, there's no per-item `pipeline` JSON column to persist
stage-by-stage progress into — a run is short-lived (six cheap, mostly-CPU-bound stages), and the
only durable state is the `ModerationItem` row created at `HUMAN_REVIEW` plus the resume job's
`resumeFromIndex`/`resolution` fields.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-moderation dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-moderation build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-moderation start  # node dist/index.js
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` |
| `STORAGE_DRIVER` | `s3` | `s3`\|`memory` — only used by `MALWARE` when a job carries `content.fileKey` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | S3-compatible object storage |
| `MODERATION_WORKER_CONCURRENCY` | `4` | BullMQ concurrency |
| `ANTHROPIC_API_KEY` | — | Optional: enables the AI_SAFETY provider's Claude classification layer over the heuristic baseline; falls back to heuristics on any failure or if unset |
| `MODERATION_REQUIRE_REVIEW_FOR_LOW` | `false` | `true` sends every flagged item to `HUMAN_REVIEW`, even LOW severity; `false` (default) auto-clears LOW-severity-only findings |
| `LOG_LEVEL` | `info` | pino level |

## Job payload

```ts
{
  refKind: 'ASSET' | 'PRODUCT' | 'WORLD' | 'GAME' | 'REVIEW' | 'USER' | 'NPC';
  refId: string;
  reporterId?: string;         // set for a user-submitted report
  reason?: string;
  content?: { text?: string; fileKey?: string; fileName?: string };
  licenses?: LicenseRecord[];  // ASSET/PRODUCT only — checked at LICENSE
  itemId?: string;             // resume: existing ModerationItem id
  resumeFromIndex?: number;    // resume: stage index (HUMAN_REVIEW's index)
  resolution?: 'APPROVED' | 'REJECTED'; // resume: the human verdict
}
```

**Wired.** `services/api/src/modules/products/index.ts` enqueues onto `moderation.scan` on Product
create/update (`refKind: 'PRODUCT'`, title+description as `content.text`) and on Review create
(`refKind: 'REVIEW'`, body as `content.text`). `services/api/src/modules/moderation/index.ts`
enqueues from `POST /moderation/report`, and `POST /moderation/:id/resolve` re-enqueues the same
job with `{ itemId, resolution, resumeFromIndex: MODERATION_HUMAN_REVIEW_STAGE_INDEX }` (the
constant lives in `services/api/src/queues.ts`, mirroring `HUMAN_REVIEW`'s position in
`MODERATION_STAGE_NAMES`) so the pipeline continues to `PUBLISH` or stops on a rejection. `POST
/assets/:id/publish` (`services/api/src/modules/assets/index.ts`) also enqueues with
`refKind: 'ASSET'`.

## Public API

- `startWorker(config?)` / `processJob(job, deps)` / `buildContext(job, deps)` — same shape as
  `worker-asset-processing`'s equivalents.
- `runModerationPipeline(ctx, stages, startIndex?)` (`src/pipeline.ts`) and `MODERATION_PIPELINE`
  (`src/stages/index.ts`) — the ordered stage list; each stage is exported individually.
- `scanTextSafetyHeuristics(text)` / `resolveSafetyProvider(anthropicApiKey?)` (`src/textPolicy.ts`)
  — the AI_SAFETY classification logic.
- `scanContentPolicy(text)` (`src/contentPolicy.ts`) — the CONTENT_POLICY heuristics.

## Notable implementation choices

- **AI_SAFETY** and **CONTENT_POLICY** never hard-fail the pipeline on their own — every finding is
  severity-ranked and routed to `HUMAN_REVIEW`. Only `LICENSE` (an objective, non-judgment-call
  fact) and `MALWARE` (a genuine executable signature) auto-reject outright.
- **HUMAN_REVIEW auto-clear**: content with no findings, or only LOW-severity findings (when
  `MODERATION_REQUIRE_REVIEW_FOR_LOW=false`, the default), skips the human queue entirely and goes
  straight to `PUBLISH` — the human queue is for genuinely ambiguous/risky content, not every
  listing.
- **PUBLISH** always emits `MODERATION_RESOLVED`. For the human-approved resume path, this is a
  deliberate, documented duplicate of the event `POST /moderation/:id/resolve` already publishes in
  `services/api` at resolution time — consumers key off `itemId`/`refId` and should treat the event
  as idempotent rather than this worker suppressing its own signal based on how the case got there.
- **Text-safety and content-policy heuristics are intentionally narrow, high-precision regex sets**
  (see the comments in `textPolicy.ts`/`contentPolicy.ts`), tuned not to flag ordinary dark-themed
  game copy ("zombie apocalypse shooter"). They are a real, always-available baseline — not a
  placeholder — but are explicitly not a substitute for a production trust & safety model; the
  optional Anthropic layer adds nuance without replacing them (results are unioned, never narrowed).

## Tests

`pnpm --filter @sonic-gameworld/worker-moderation test` (vitest):

- `src/pipeline.test.ts` — end-to-end runs against an in-memory Prisma fake + event bus: clean
  content auto-clears to `PUBLISH`; flagged content parks at `HUMAN_REVIEW` (`WAITING`) and creates
  a `ModerationItem`; resuming with `APPROVED`/`REJECTED` completes/fails correctly and `REJECTED`
  never reaches `PUBLISH`; a non-commercial license on a commercial listing fails fast at `LICENSE`.
- `src/textPolicy.test.ts`, `src/contentPolicy.test.ts` — heuristic unit tests, including a
  false-positive guard (ordinary violent game copy must not be flagged).
