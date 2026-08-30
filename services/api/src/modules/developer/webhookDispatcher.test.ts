import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createEvent, createEventBus } from '@sonic-gameworld/events';
import { createFakePrisma } from '../../test/fakePrisma.js';
import { loadConfig } from '../../config.js';
import { createLogger } from '../../logger.js';
import { computeSignature, deliverToWebhook, startWebhookDispatcher, type WebhookRow } from './webhookDispatcher.js';

describe('computeSignature', () => {
  it('produces a deterministic sha256= HMAC of the exact raw body', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ hello: 'world' });
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(computeSignature(secret, body)).toBe(expected);
  });

  it('changes when the secret changes', () => {
    const body = '{"a":1}';
    expect(computeSignature('secret-a', body)).not.toBe(computeSignature('secret-b', body));
  });

  it('changes when the body changes', () => {
    const secret = 'whsec_test';
    expect(computeSignature(secret, '{"a":1}')).not.toBe(computeSignature(secret, '{"a":2}'));
  });
});

describe('deliverToWebhook', () => {
  const webhook: WebhookRow = { id: 'wh_1', url: 'https://example.com/hook', events: ['WORLD_PUBLISHED'], secret: 'whsec_abc', active: true, failureCount: 0 };

  it('signs the exact body it sends, and the receiver can verify it', async () => {
    const event = createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } });
    let capturedBody = '';
    let capturedSignature = '';
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      const headers = init?.headers as Record<string, string>;
      capturedSignature = headers['x-gameworld-signature'] ?? '';
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await deliverToWebhook(webhook, event, { timeoutMs: 1000, fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(capturedSignature).toBe(computeSignature(webhook.secret!, capturedBody));
    expect(JSON.parse(capturedBody)).toMatchObject({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } });
  });

  it('reports failure (without throwing) when the receiver responds non-2xx', async () => {
    const event = createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } });
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const result = await deliverToWebhook(webhook, event, { timeoutMs: 1000, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it('reports failure when the fetch itself throws (network error)', async () => {
    const event = createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } });
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await deliverToWebhook(webhook, event, { timeoutMs: 1000, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('startWebhookDispatcher', () => {
  it('delivers a matching event to an active webhook and resets failureCount on success', async () => {
    const prisma = createFakePrisma();
    const bus = createEventBus({ driver: 'memory' });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
    const log = createLogger('test');

    const webhook = await prisma.webhook.create({
      data: { ownerId: 'u1', url: 'https://example.com/hook', events: ['WORLD_PUBLISHED'], secret: 'whsec_x', active: true, failureCount: 3 },
    });

    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      seen.push(String(url));
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const unsubscribe = startWebhookDispatcher({ bus, db: prisma, config, log, fetchImpl });

    await bus.publish(createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } }));
    // The dispatcher does its work asynchronously off the publish call; give the microtask queue a turn.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(seen).toEqual(['https://example.com/hook']);
    const updated = await prisma.webhook.findUnique({ where: { id: webhook.id } });
    expect(updated.failureCount).toBe(0);
    expect(updated.lastDeliveryAt).toBeTruthy();

    unsubscribe();
    await bus.close();
  });

  it('does not deliver to a webhook not subscribed to the event type', async () => {
    const prisma = createFakePrisma();
    const bus = createEventBus({ driver: 'memory' });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
    const log = createLogger('test');

    await prisma.webhook.create({ data: { ownerId: 'u1', url: 'https://example.com/hook', events: ['ORDER_PAID'], secret: 's', active: true, failureCount: 0 } });

    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const unsubscribe = startWebhookDispatcher({ bus, db: prisma, config, log, fetchImpl });

    await bus.publish(createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: 'w1', versionId: 'v1' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchImpl).not.toHaveBeenCalled();
    unsubscribe();
    await bus.close();
  });
});
