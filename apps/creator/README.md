# @sonic-gameworld/creator — Creator Passport dashboard

Port **3003**. The creator-facing control panel for Sonic GameWorld OS: sales, revenue,
reputation (Creator Score), product publishing (with a full License Builder + Asset Passport
wizard), publish-pipeline status, analytics, payouts, storefront editing, and org/subscription
settings. Built with Next.js 15 (App Router), React 19, Tailwind (via `@sonic-gameworld/ui`'s
shared preset), and Zustand for the publish wizard's form state.

## Running it

```bash
pnpm --filter @sonic-gameworld/creator dev     # http://localhost:3003
pnpm --filter @sonic-gameworld/creator build
pnpm --filter @sonic-gameworld/creator typecheck
pnpm --filter @sonic-gameworld/creator test
```

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL for `services/api`. |
| `NEXT_PUBLIC_DEVELOPER_PORTAL_URL` | `http://localhost:3005` | Linked to from Settings → API keys. |

### Offline demo fallback

`lib/api.tsx` establishes a session on load: try a stored bearer token via `GET /auth/me`, else
`POST /auth/dev` (dev login), else fall back to `status: 'demo'`. Every page fetches its resource
through `useResource()` (`lib/api.tsx`), which tries the live API first and falls back to
deterministic fixtures in `lib/demo.ts` on *any* failure (no backend running, dev-login rejected,
network error, timeout). A yellow banner ("Showing offline demo data…") appears on every page
whenever it is rendering fallback data, and the sidebar shows a Live/Demo indicator. This means
the whole dashboard is fully explorable — including the publish wizard and pipeline view — with
no API process running at all.

## Pages

- `/` — Overview: `StatTile`s (sales, revenue, followers, avg rating, payouts pending), Creator
  Score `ScoreRing` + the 8 weighted sub-scores as bars (`ReputationBars`), a dependency-free SVG
  revenue line chart (`RevenueChart`), a recent-orders table, and the plan tier card with an
  upgrade CTA linking to Settings.
- `/products` — `DataTable` of every product with status, derived pipeline stage, price, sales
  and row actions (view pipeline / edit).
- `/products/new` — 5-step publish wizard (Zustand store in `lib/wizard-store.ts`):
  1. **Type & category** — digital asset vs. published world, marketplace category.
  2. **Upload or pick a world** — presigned upload via `@sonic-gameworld/asset-sdk`'s
     `uploadAsset()` with a live progress bar, or pick one of the creator's existing worlds.
  3. **Details** — name, description, genre (multi-select), engine targets, free-text specs.
  4. **License builder & pricing** — all 10 `LicenseRecord` boolean flags, attribution text,
     seat count, optional SPDX id, and price; a live `LicenseBadge` preview shows compatibility
     for a "commercial + multiplayer" buyer and a "personal-use-only" buyer as flags change.
  5. **Review & submit** — renders the full listing + Asset Passport summary and calls
     `POST /v1/products`, then redirects to the pipeline view.
- `/products/[id]/pipeline` — the 16 `PIPELINE_STAGES` (CONTRACTS §13) as a live vertical
  stepper. In live mode it subscribes to the `creator:<id>` realtime topic
  (`client.connectRealtime`) and applies `ASSET_PIPELINE_UPDATE` events; in demo mode it
  simulates stage-by-stage progress on an interval so the page still feels alive.
- `/analytics` — activation, uploads, conversion, retention and revenue `StatTile`s, a revenue
  trend chart, and a per-product performance table.
- `/payouts` — balance (available / pending / lifetime), a "Request payout" action, payout
  history table, and holds with reasons.
- `/storefront` — edit handle, bio and banner; toggle featured products; a "Preview storefront"
  link out to the marketplace app's `/c/[handle]`.
- `/settings` — org members & roles (invite, change role), a quick-start API key minting flow
  (full management linked out to the developer portal), and subscription management via the
  shared `PlanTierTable`.

## Public API (exported from this package)

This is an app, not a library — nothing is published for other packages to import. The reusable
pieces worth knowing about if you're extending this dashboard:

- `lib/api.tsx` — `ApiProvider`, `useApi()`, `useResource(key, fetcher, demoFactory)` (the
  live-API-with-demo-fallback hook every page uses).
- `lib/demo.ts` — deterministic offline fixtures (`demoDashboard`, `demoProductRows`,
  `demoAnalytics`, `demoPayouts`, `demoPassport`, `demoPipelineFor`, ...).
- `lib/license.ts` — `buildLicenseRecord(form, productId?)` and `summarizeLicense(record)`, the
  publish wizard's License Builder → `LicenseRecord` mapping (unit-tested in `lib/license.test.ts`).
- `lib/wizard-store.ts` — `useWizardStore` (Zustand) driving the 5-step publish wizard.
- `components/` — `Shell`, `RevenueChart` (SVG, no chart lib), `ReputationBars`,
  `PlanTierTable`, `PipelineStages`, `LicenseBuilder`, and `components/wizard/*` (one component
  per wizard step).

## Test / build status

- `pnpm typecheck` — passes.
- `pnpm build` (`next build`) — passes; all 8 routes prerender/compile cleanly.
- `pnpm test` (vitest) — passes: 8 tests in `lib/license.test.ts` covering the License Builder →
  `LicenseRecord` mapping (default conservative record, all-flags-on, attribution text
  gating on the flag, seat validation/flooring, SPDX trimming, and the review-step summary text).

## Known API gaps (documented, not blocking)

CONTRACTS §9 does not yet expose a couple of resources this dashboard's design calls for. Each is
called out at its usage site with a comment; the dashboard degrades gracefully (renders demo data
or a static/local-only affordance) rather than throwing:

- **Recent orders feed** — there is no "sales feed scoped to a creator's products" endpoint (only
  a buyer-scoped `GET /orders`). The Overview page's recent-orders table always renders demo data.
- **Payout holds** — `GET /creators/me/balance` / `.../payouts` have no `holds` field or dedicated
  endpoint. The Payouts page renders holds from demo fixtures only.
- **Org members list** — `POST/PATCH /orgs/:id/members` exist for mutation, but there is no
  `GET /orgs/:id/members` to list them; Settings renders the member list from demo fixtures and
  performs invites/role-changes against the live API when connected.

None of these gaps block a real backend from working — once the corresponding endpoints exist,
swapping the relevant `useResource` fetcher (and removing the "Known API gaps" comment) is a
localized change.
