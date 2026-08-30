import { describe, expect, it } from 'vitest';
import { applyOverlay, isValidWebhookUrl } from './webhooks';
import type { Webhook } from '@sonic-gameworld/gameworld-sdk';

const BASE_WEBHOOK: Webhook = {
  id: 'wh_1', url: 'https://example.dev/hooks', active: true, failureCount: 0,
  events: ['ORDER_PAID'], description: 'original', lastDeliveryAt: null, createdAt: new Date().toISOString(),
};

describe('isValidWebhookUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isValidWebhookUrl('https://example.dev/hooks')).toBe(true);
    expect(isValidWebhookUrl('http://localhost:3000/hooks')).toBe(true);
  });
  it('rejects malformed or non-http(s) values', () => {
    expect(isValidWebhookUrl('not a url')).toBe(false);
    expect(isValidWebhookUrl('ftp://example.dev/hooks')).toBe(false);
    expect(isValidWebhookUrl('')).toBe(false);
  });
});

describe('applyOverlay', () => {
  it('returns the base webhook with an empty delivery log when there is no overlay', () => {
    const merged = applyOverlay(BASE_WEBHOOK);
    expect(merged.active).toBe(true);
    expect(merged.description).toBe('original');
    expect(merged.deliveries).toEqual([]);
  });

  it('lets a local overlay override active state, description and deliveries', () => {
    const merged = applyOverlay(BASE_WEBHOOK, {
      active: false,
      description: 'disabled by operator',
      deliveries: [{ id: 'dlv_1', event: 'ORDER_PAID', status: 'SUCCESS', statusCode: 200, attemptedAt: new Date().toISOString(), durationMs: 50 }],
    });
    expect(merged.active).toBe(false);
    expect(merged.description).toBe('disabled by operator');
    expect(merged.deliveries).toHaveLength(1);
    // Fields not present in the overlay still come from the base webhook.
    expect(merged.url).toBe(BASE_WEBHOOK.url);
  });
});
