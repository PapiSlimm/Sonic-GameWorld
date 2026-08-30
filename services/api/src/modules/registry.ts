// Central module registry. `buildApp()` (src/app.ts) registers every entry here under the `/v1`
// prefix, in array order.
//
// HOW TO APPEND YOUR MODULE (read this before editing):
//   1. Your module owns its own directory: src/modules/<your-domain>/index.ts.
//   2. It exports a single async function matching `ModuleRegistrar`:
//        import type { FastifyInstance } from 'fastify';
//        export async function registerWorldsModule(app: FastifyInstance): Promise<void> {
//          app.get('/worlds', { preHandler: [app.authenticate] }, async (request, reply) => { ... });
//          // ...the rest of your routes, unprefixed — the /v1 prefix is applied by app.ts.
//        }
//   3. In THIS file only: add one import line and one line appending your registrar to MODULES.
//      Do not reorder or remove existing entries — append at the bottom of the array.
//      Do not edit any other file in this list to add your module.
//
// Example diff for a new "worlds" module:
//   import { registerWorldsModule } from './worlds/index.js';
//   ...
//   export const MODULES: ModuleRegistrar[] = [
//     ...
//     registerAnalyticsModule,
//     registerWorldsModule, // <-- appended here
//   ];
//
// Every registrar receives the same `app` (already carrying app.db, app.bus, app.redis,
// app.storage, app.searchService, app.config, app.quotas, app.authenticate, app.requireRole,
// app.requirePermission — see src/types.ts) scoped under the `/v1` prefix. Routes should be
// registered with paths relative to that prefix (e.g. `app.get('/worlds/:id', ...)`, never
// `/v1/worlds/:id`).
import type { ModuleRegistrar } from '../types.js';
import { registerHealthModule } from './health/index.js';
import { registerAuthModule } from './auth/index.js';
import { registerIdentityModule } from './identity/index.js';
import { registerCreatorModule } from './creator/index.js';
import { registerNotificationsModule } from './notifications/index.js';
import { registerDeveloperModule } from './developer/index.js';
import { registerAnalyticsModule } from './analytics/index.js';
import { registerProductsModule } from './products/index.js';
import { registerLicensingModule } from './licensing/index.js';
import { registerMarketplaceModule } from './marketplace/index.js';
import { registerOrdersModule } from './orders/index.js';
import { registerPaymentsModule } from './payments/index.js';
import { registerSubscriptionsModule } from './subscriptions/index.js';
import { registerRoyaltiesModule } from './royalties/index.js';
import { registerSearchModule } from './search/index.js';
import { registerRecommendationModule } from './recommendation/index.js';
import { registerModerationModule } from './moderation/index.js';
import { registerWorldsModule } from './worlds/index.js';
import { registerGamesModule } from './games/index.js';
import { registerNpcsModule } from './npcs/index.js';
import { registerMissionsModule } from './missions/index.js';
import { registerCloudModule } from './cloud/index.js';
import { registerAiModule } from './ai/index.js';
import { registerAssetsModule } from './assets/index.js';

export type { ModuleRegistrar };

/** Every domain module, in registration order. Other agents APPEND theirs at the bottom. */
export const MODULES: ModuleRegistrar[] = [
  registerHealthModule,
  registerAuthModule,
  registerIdentityModule,
  registerCreatorModule,
  registerNotificationsModule,
  registerDeveloperModule,
  registerAnalyticsModule,
  registerProductsModule,
  registerLicensingModule,
  registerMarketplaceModule,
  registerOrdersModule,
  registerPaymentsModule,
  registerSubscriptionsModule,
  registerRoyaltiesModule,
  registerSearchModule,
  registerRecommendationModule,
  registerModerationModule,
  registerWorldsModule,
  registerGamesModule,
  registerNpcsModule,
  registerMissionsModule,
  registerCloudModule,
  registerAiModule,
  registerAssetsModule,
  // <-- other agents: append your registrar above this line, do not remove it.
];
