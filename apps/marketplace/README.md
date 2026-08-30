# GameWorld Market

The spatial marketplace of Sonic GameWorld OS — port **3001**. Discover worlds, games and assets by
flying a globe instead of scrolling a list, then buy, license and hand assets off into GameWorld Studio.

Built against `docs/CONTRACTS.md` §12 (frontend apps) and §5 (marketplace taxonomy). Next.js 15 App
Router, React 19, Tailwind (via `@sonic-gameworld/ui`'s preset), Zustand for client-side cart/wishlist/
library state.

## Running it

```bash
pnpm --filter @sonic-gameworld/marketplace dev     # http://localhost:3001
pnpm --filter @sonic-gameworld/marketplace build
pnpm --filter @sonic-gameworld/marketplace typecheck
pnpm --filter @sonic-gameworld/marketplace test
```

No backend is required. Every data-access helper in `src/lib/data.ts` tries `services/api` (via
`@sonic-gameworld/gameworld-sdk`) first and falls back to the bundled offline demo catalog
(`src/lib/demo.ts` — 24 products across all 10 `ProductCategory` values, with creators, licenses, Asset
Passports, reviews and a deterministic `creatorScore`) whenever the API is unreachable or
`NEXT_PUBLIC_API_URL` isn't set, which is the default in this sandbox.

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | unset → offline demo mode | Base URL of `services/api`. |
| `NEXT_PUBLIC_STUDIO_URL` | `http://localhost:3000` | Target for "Open in Studio" links from `/library`. |

## Pages

| Route | Purpose |
|---|---|
| `/` | Spatial discovery home: a synchronized 3-panel layout — left spatial tree (WORLD → CITY → DISTRICT → BUILDING → ROOM → ASSET), center `DiscoveryGlobe`/2D radial fallback, right preview card. |
| `/search` | Every listing, filterable by category/genre/engine/price/license flags/creator score, sorted by rank (§14). Client-side reducer (`src/lib/searchFilters.ts`), URL-synced. |
| `/category/[slug]` | One of the 10 categories, sortable, with quick links across all categories. |
| `/p/[slug]` | Product page: 3D preview (or thumbnail fallback), NEON TOKYO 2099-style spec table, `LicenseBadge` + full license matrix, Asset Passport panel, "check compatibility with my project", reviews, buy/cart/wishlist, creator card with `ScoreRing`. |
| `/cart` | Cart with quantity controls and order summary. |
| `/checkout` | Stripe redirect when a live API is configured, mock success otherwise. |
| `/library` | Purchased products with the `ULTRA…WEB` variant ladder and "Open in Studio". |
| `/c/[handle]` | Creator storefront: reputation `ScoreRing`, badges, stats, product grid. |

## Spatial discovery: DiscoveryGlobe availability

`@sonic-gameworld/spatial-engine/react` (the `DiscoveryGlobe`/`SpatialViewport` React bindings) is being
built by a concurrent agent and did not have a compiled `dist/react.js` at the time this app was built.
Because Next's webpack resolver hard-fails at build time — not just at runtime — when an `exports`
subpath is declared but the target file is missing, this app can't simply `next/dynamic(() =>
import('@sonic-gameworld/spatial-engine/react'))` and catch the failure the normal way:

- `next.config.mjs` checks, on every build, whether `packages/spatial-engine/dist/react.js` exists. If
  not, it aliases the subpath to a local shim (`src/lib/spatialEngineReactShim.ts`) that intentionally
  doesn't export `DiscoveryGlobe`/`SpatialViewport`.
- `DiscoveryGlobeStage` / `ProductPreviewStage` treat a missing export exactly like "not available yet"
  (or a WebGL failure) and render the 2D radial SVG graph (`SpatialCanvas`) / a styled thumbnail card
  instead.
- `src/types/spatial-engine-react-ambient.d.ts` gives `pnpm typecheck` the same graceful fallback for
  types.

Once spatial-engine ships `dist/react.js`, both the alias and the ambient type fallback stop applying
automatically — no changes needed here — and the real 3D `DiscoveryGlobe`/`SpatialViewport` take over.

## Public API

This is an app, not a library — nothing is published for other packages to import. Notable internals for
future contributors:

- `src/lib/data.ts` — API-first/demo-fallback data access (`getFeatured`, `searchProducts`,
  `getProductBySlug`, `getCreatorPassport`, `checkCompatibility`, …).
- `src/lib/searchFilters.ts` — the pure `searchReducer` + `rankProduct`/`applyProductFilters` (CONTRACTS
  §14 ranking formula), unit-tested in `searchFilters.test.ts`.
- `src/lib/spatialTree.ts` — builds the 6-level spatial tree (`buildDiscoveryTree`) and the 3-ring globe
  summary (`buildGlobeClusters`) from the product catalog.
- `src/lib/cartStore.ts` — Zustand store for cart/wishlist/library, persisted to `localStorage`.
