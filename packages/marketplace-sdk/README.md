# @sonic-gameworld/marketplace-sdk

Thin wrapper over `@sonic-gameworld/gameworld-sdk` scoped to the marketplace/commerce routes
(docs/CONTRACTS.md §9 `marketplace:`, `licensing:`).

## Install

```bash
pnpm add @sonic-gameworld/marketplace-sdk
```

## Usage

```ts
import { createMarketplaceClient } from '@sonic-gameworld/marketplace-sdk';

const marketplace = createMarketplaceClient({ baseUrl: 'http://localhost:4000', token });
const results = await marketplace.marketplace.search({ q: 'cyberpunk', category: 'WORLD' });
await marketplace.cart.addItem({ productId: results.items[0].id });
const order = await marketplace.orders.create({ fromCart: true });
```

Need more than commerce (assets/ai/etc.)? Use `createFullClient(options)` to get the full
`GameWorldClient` from `@sonic-gameworld/gameworld-sdk`.

## Env vars

None.

## Public API

- `createMarketplaceClient(options): MarketplaceClient` — `{ marketplace, products, wishlist,
  cart, orders, library, licenses }`, each the matching namespace of `GameWorldClient`.
- `createFullClient(options): GameWorldClient`.
- Re-exported DTO types (`Product`, `ProductSummary`, `Cart`, `Order`, `Review`, `LibraryItem`, …)
  and world-schema taxonomy (`PRODUCT_CATEGORIES`, `GENRES`, `ENGINE_TARGETS`,
  `checkLicenseCompatibility`, `LICENSE_PRESETS`).

## Build & test

```bash
pnpm --filter @sonic-gameworld/marketplace-sdk build
pnpm --filter @sonic-gameworld/marketplace-sdk test
```
