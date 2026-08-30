import { describe, expect, it } from 'vitest';
import { createEvent, createEventBus, defineHandler, deserializeEvent, EVENT_TYPES, FANOUT, fanoutTargets, MemoryEventBus, registerHandler, serializeEvent } from './index.js';

describe('memory event bus', () => {
  it('publishes to typed and wildcard subscribers', async () => {
    const bus = createEventBus({ driver: 'memory' });
    const seen: string[] = [];
    bus.subscribe('WORLD_CREATED', (e) => {
      seen.push(`typed:${e.type}`);
    });
    bus.subscribe('*', (e) => {
      seen.push(`all:${e.type}`);
    });
    await bus.publish(createEvent({ type: 'WORLD_CREATED', payload: { worldId: 'w1', ownerId: 'u1', name: 'X' } }));
    await bus.publish(createEvent({ type: 'ORDER_PAID', payload: { orderId: 'o1', buyerId: 'u1', totalCents: 100, paymentRef: 'p' } }));
    expect(seen).toEqual(['typed:WORLD_CREATED', 'all:WORLD_CREATED', 'all:ORDER_PAID']);
    await bus.close();
  });

  it('unsubscribes and isolates handler errors', async () => {
    const errors: unknown[] = [];
    const bus = new MemoryEventBus({ onError: (e) => errors.push(e) });
    const off = bus.subscribe('NPC_CREATED', () => {
      throw new Error('boom');
    });
    let count = 0;
    bus.subscribe('NPC_CREATED', () => {
      count++;
    });
    await bus.publish(createEvent({ type: 'NPC_CREATED', payload: { npcId: 'n', name: 'N' } }));
    off();
    await bus.publish(createEvent({ type: 'NPC_CREATED', payload: { npcId: 'n', name: 'N' } }));
    expect(errors).toHaveLength(1);
    expect(count).toBe(2);
    expect(bus.history).toHaveLength(2);
  });

  it('typed defineHandler receives typed payload', async () => {
    const bus = new MemoryEventBus();
    let total = 0;
    const h = defineHandler('PLAYER_PURCHASED_ASSET', (e) => {
      total += e.payload.priceCents; // typed access
    });
    registerHandler(bus, h);
    await bus.publish(createEvent({ type: 'PLAYER_PURCHASED_ASSET', payload: { orderId: 'o', orderItemId: 'oi', buyerId: 'b', productId: 'p', creatorId: 'c', priceCents: 1999, feeCents: 300, royaltyCents: 1699 } }));
    expect(total).toBe(1999);
  });

  it('waitFor resolves', async () => {
    const bus = new MemoryEventBus();
    const p = bus.waitFor('ASSET_UPLOADED');
    await bus.publish(createEvent({ type: 'ASSET_UPLOADED', payload: { assetId: 'a', versionId: 'v', creatorId: 'c', fileName: 'x.glb', sizeBytes: 1 } }));
    expect((await p).type).toBe('ASSET_UPLOADED');
  });
});

describe('event helpers', () => {
  it('round-trips serialization', () => {
    const e = createEvent({ type: 'GAME_PUBLISHED', payload: { gameId: 'g', versionId: 'v' }, actorId: 'u' });
    expect(e.version).toBe(1);
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    const back = deserializeEvent(serializeEvent(e));
    expect(back).toEqual(e);
    expect(() => deserializeEvent('{"nope":1}')).toThrow();
  });

  it('fanout map matches spec', () => {
    expect(FANOUT.PLAYER_PURCHASED_ASSET).toEqual(['billing', 'creator', 'analytics', 'inventory']);
    expect(FANOUT.GAME_PUBLISHED).toEqual(['search', 'marketplace', 'recommendation']);
    expect(fanoutTargets('UNKNOWN')).toEqual([]);
    expect(EVENT_TYPES).toContain('AI_TOOL_EXECUTED');
  });

  it('pubsub/kafka drivers construct without loading SDKs', () => {
    expect(() => createEventBus({ driver: 'pubsub' })).not.toThrow();
    const k = createEventBus({ driver: 'kafka', brokers: ['localhost:9092'] });
    expect(typeof k.publish).toBe('function');
  });
});
