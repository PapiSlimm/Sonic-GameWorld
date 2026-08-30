import { createSampleWorld, SAMPLE_OWNER_ID, type WorldDocument } from '@sonic-gameworld/world-schema';
import type { World } from '@sonic-gameworld/gameworld-sdk';

/** Builds the offline demo world document (used whenever the API is unreachable). */
export function buildOfflineDocument(): WorldDocument {
  return createSampleWorld('NEON_TOKYO_2099');
}

/** Derives a `World` list-item/meta record from a full document, for pages that only need metadata. */
export function documentToWorldMeta(doc: WorldDocument): World {
  return {
    id: doc.id,
    ownerId: SAMPLE_OWNER_ID,
    orgId: null,
    name: doc.name,
    slug: doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    description: doc.description,
    genre: doc.genre,
    status: 'DRAFT',
    sizeKm2: doc.sizeKm2,
    maxPlayers: doc.maxPlayers,
    thumbnailUrl: null,
    currentVersionId: null,
    entityCount: doc.entities.length,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    publishedAt: null,
  };
}
