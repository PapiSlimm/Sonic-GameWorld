# Roadmap

Source: SPEC.pdf §57 "Development Roadmap", §58 "The First MVP", §59 "The MVP Feature Set". The
spec is explicit that this should **not** be built all at once — five phases, then a named MVP loop
inside them.

Each phase's build list below is annotated against the current state of this monorepo (as of this
assignment's completion) so it's clear how much of "Phase 1" and "Phase 2" is already implemented
versus still aspirational — this annotation is informational, not part of the original spec text.

## Phase 1 — Foundation (Months 0–3)

Build: identity · Creator Passport · Studio shell · spatial engine · world schema · asset system ·
marketplace foundation · payments · licensing · basic AI · storage · analytics.

Status in this repo: **largely present**. `services/api` implements identity (dev login, Firebase
exchange, API keys), the creator domain, worlds/assets/marketplace/payments/licensing modules;
`@sonic-gameworld/world-schema` and `@sonic-gameworld/spatial-engine` exist as packages; `apps/studio`
is scaffolded; storage (S3-compatible + presigned URLs) and analytics (worker + routes) are wired.
The AI orchestrator's tool pipeline (§8) and `mock` provider satisfy "basic AI."

## Phase 2 — Creator Engine (Months 3–6)

Add: World Builder · Director Mode · AI Director · NPC creation · missions · asset pipeline ·
Unity SDK · Unreal plugin · publishing.

Status in this repo: **largely present**. `apps/studio` includes the editor and AI Director command
bar surfaces per CONTRACTS §12; NPC and mission modules exist server-side; `workers/asset-processing`
is the asset pipeline. **This assignment's own deliverables complete two Phase 2 line items**: the
Unity SDK (`integrations/unity/com.sonicgameworld.sdk`) and the Unreal plugin
(`integrations/unreal/SonicGameWorld`) were built out to feature parity as part of this work (see the
final report for what was added to the Unreal side specifically).

## Phase 3 — Marketplace (Months 6–9)

Launch: Worlds · Assets · Systems · AI NPCs · Game Kits · Missions · Cinematics · creator storefronts ·
reviews · ratings · royalties.

Status in this repo: marketplace and licensing modules, `apps/marketplace`, and the royalty/payout
path (Stripe Connect transfers) exist; creator storefronts (`apps/marketplace`'s `/c/:handle`) and
reviews/ratings routes are in the API surface (`docs/API.md`). Cinematics (`CameraRig`,
`CinematicSequence` in the world schema) exist at the schema level; a dedicated Studio cinematics UI
is the more speculative remaining piece.

## Phase 4 — Player Ecosystem (Months 9–12)

Launch: GameWorld Play · UGC experiences · multiplayer · social · discovery · creator following ·
events · player profiles.

Status in this repo: `apps/player` is scaffolded per CONTRACTS §12; game sessions, matchmaking, and
live-events routes exist server-side (`/cloud/*`, `/games/:id/sessions`). Multiplayer session
infrastructure and the social/following graph are the least-built parts of this phase relative to
the rest of the repo.

## Phase 5 — Intelligence (Year 2)

Add: AI Game Director · AI QA · predictive analytics · advanced NPC memory · procedural world
generation · world simulation · intelligent recommendations · automated game balancing.

Status in this repo: not started — this phase is explicitly Year 2 scope in the source spec, and
nothing in the current codebase targets it yet beyond the extensibility already built into the AI
provider interface (swapping in a more capable provider/role doesn't require a pipeline redesign)
and the recommendation routes' basic scaffolding (`/recommendations`, currently non-AI-driven).

## The First MVP (§58)

Don't build the entire vision first. The first commercially meaningful version should prove one
loop:

```
CREATE WORLD → ADD ASSETS → ADD NPC → ADD GAMEPLAY → PLAY → PUBLISH → SELL
```

If that loop works beautifully, the foundation is proven. Every other feature is in service of
making one or more steps in this loop deeper, not replacing it.

Status: this loop is **structurally complete end-to-end** in the current codebase — `POST /worlds`
+ `PUT /worlds/:id/document` (create world), the asset upload/publish routes (add assets),
`POST /npcs` (add NPC), the mission/system routes (add gameplay), `spatial-engine`'s web runtime or
a session join (play), `POST /worlds/:id/publish` (publish), and the marketplace checkout →
Stripe/mock payment → royalty fan-out path (sell) all exist and are wired to real Prisma models and
a real (if mock-fallback-capable) AI/payment layer. Whether the loop is *polished* end-to-end in
the actual `apps/*` UIs is outside this assignment's scope to verify.

## The MVP Feature Set (§59)

Version 1 should contain:

**Studio**
- spatial editor
- world builder
- asset placement
- scene hierarchy
- Director Mode
- basic AI Director

**Marketplace**
- assets
- worlds
- systems
- characters
- Game Kits

**Creator**
- Creator Passport
- storefront
- publishing
- analytics
- payouts

**AI**
- world assistant
- NPC generator
- mission generator
- basic cinematic director

**Engine**
- Web runtime
- Unity integration
- Unreal integration

**Business**
- subscriptions
- marketplace transactions
- licensing
- royalties

"That is enough to launch." — SPEC.pdf §59. Everything past this list (procedural world generation,
AI Game Director, predictive analytics, etc.) is explicitly Phase 5 / Year 2 scope, not MVP scope —
resist pulling it forward.
