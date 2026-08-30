import { createEmptyWorld, transformAt, type WorldDocument, type WorldEntity } from '@sonic-gameworld/world-schema';

export function buildTestWorld(): WorldDocument {
  const doc = createEmptyWorld({ id: 'world-test-1', name: 'Test World', ownerId: 'creator-1', sizeKm2: 1 });
  const spawn: WorldEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'PLAYER_SPAWN',
    name: 'Main Spawn',
    transform: transformAt(0, 0, 0),
    tags: [],
    permissions: { ownerId: 'creator-1', editors: [], visibility: 'PUBLIC' },
    metadata: {},
  };
  const prop: WorldEntity = {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'PROP',
    name: 'Neon Sign',
    transform: transformAt(10, 0, 5),
    assetRef: { assetId: 'asset-neon-sign', versionId: 'version-1' },
    tags: ['neon', 'sign'],
    permissions: { ownerId: 'creator-1', editors: [], visibility: 'PUBLIC' },
    metadata: {},
  };
  return { ...doc, entities: [spawn, prop] };
}
