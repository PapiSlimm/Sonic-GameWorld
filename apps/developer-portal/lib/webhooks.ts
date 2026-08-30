import type { CreateWebhookInput, Webhook } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client';
import { isLiveSession } from './keys';
import { readStore, upsertEntry, removeEntry } from './overrides';

/**
 * CONTRACTS §9 only defines `GET /v1/developer/webhooks` and `POST /v1/developer/webhooks`.
 * There is no update, delete, test-send, or delivery-log route yet. Create/list run against the
 * real API when a session exists; delete/update/test-send/delivery-log are layered on top as a
 * local overlay (keyed by webhook id) so the page is fully usable today and clearly labeled
 * where it is standing in for a future admin API. See README "Cross-package gaps".
 *
 * `EVENT_TYPES`/`EventType` are duplicated from CONTRACTS §7 (the canonical `@sonic-gameworld/events`
 * union) rather than imported at runtime: `@sonic-gameworld/events`' dist bundle pulls in
 * `ioredis`/`kafkajs`/`@google-cloud/pubsub` for its Redis/Kafka/PubSub bus drivers, none of which
 * resolve in a browser bundle — importing it from any `'use client'` module breaks `next build`
 * with "Module not found: net/fs/child_process". See README "Cross-package gaps".
 */
export const EVENT_TYPES = [
  'USER_REGISTERED', 'CREATOR_ACTIVATED', 'ORG_CREATED',
  'ASSET_UPLOADED', 'ASSET_PROCESSED', 'ASSET_REJECTED', 'ASSET_PUBLISHED',
  'WORLD_CREATED', 'WORLD_UPDATED', 'WORLD_PUBLISHED', 'WORLD_SNAPSHOT_CREATED',
  'GAME_CREATED', 'GAME_PUBLISHED', 'GAME_SESSION_STARTED', 'GAME_SESSION_ENDED',
  'PRODUCT_LISTED', 'PRODUCT_UPDATED', 'PRODUCT_DELISTED',
  'ORDER_CREATED', 'ORDER_PAID', 'PLAYER_PURCHASED_ASSET', 'ORDER_REFUNDED',
  'ROYALTY_ACCRUED', 'PAYOUT_REQUESTED', 'PAYOUT_SENT',
  'AI_TOOL_REQUESTED', 'AI_TOOL_EXECUTED', 'AI_TOOL_DENIED',
  'MISSION_CREATED', 'NPC_CREATED', 'REVIEW_CREATED',
  'MODERATION_FLAGGED', 'MODERATION_RESOLVED', 'FRAUD_SIGNAL',
  'ANALYTICS_EVENT',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export interface WebhookOverlay {
  deleted?: boolean;
  active?: boolean;
  description?: string | null;
  deliveries?: WebhookDelivery[];
}

export interface WebhookDelivery {
  id: string;
  event: EventType | string;
  status: 'SUCCESS' | 'FAILED';
  statusCode: number;
  attemptedAt: string;
  durationMs: number;
}

const OVERLAY_KEY = 'gw_devportal_webhook_overlay_v1';

export function readOverlays(): Record<string, WebhookOverlay> {
  return readStore<WebhookOverlay>(OVERLAY_KEY);
}

export function applyOverlay(webhook: Webhook, overlay?: WebhookOverlay): Webhook & { deliveries: WebhookDelivery[] } {
  return {
    ...webhook,
    active: overlay?.active ?? webhook.active,
    description: overlay?.description !== undefined ? overlay.description : webhook.description,
    deliveries: overlay?.deliveries ?? [],
  };
}

export async function fetchWebhooks(): Promise<Webhook[]> {
  return getClient().developer.listWebhooks();
}

export async function createWebhook(input: CreateWebhookInput): Promise<Webhook> {
  return getClient().developer.createWebhook(input);
}

/** No DELETE route exists — mark the webhook deleted in the local overlay instead. */
export function deleteWebhookLocally(id: string): Record<string, WebhookOverlay> {
  return upsertEntry<WebhookOverlay>(OVERLAY_KEY, id, { deleted: true });
}

export function setWebhookActiveLocally(id: string, active: boolean): Record<string, WebhookOverlay> {
  return upsertEntry<WebhookOverlay>(OVERLAY_KEY, id, { active });
}

export function setWebhookDescriptionLocally(id: string, description: string): Record<string, WebhookOverlay> {
  return upsertEntry<WebhookOverlay>(OVERLAY_KEY, id, { description });
}

export function removeWebhookOverlay(id: string): Record<string, WebhookOverlay> {
  return removeEntry<WebhookOverlay>(OVERLAY_KEY, id);
}

/** Simulates delivering one event to the webhook's URL and appends a delivery-log row. */
export function recordTestSend(id: string, event: EventType | string, overlay: WebhookOverlay | undefined): WebhookDelivery {
  const ok = Math.random() > 0.15;
  const delivery: WebhookDelivery = {
    id: `dlv_${Math.random().toString(36).slice(2, 10)}`,
    event,
    status: ok ? 'SUCCESS' : 'FAILED',
    statusCode: ok ? 200 : 502,
    attemptedAt: new Date().toISOString(),
    durationMs: Math.round(40 + Math.random() * 260),
  };
  const deliveries = [delivery, ...(overlay?.deliveries ?? [])].slice(0, 25);
  upsertEntry<WebhookOverlay>(OVERLAY_KEY, id, { deliveries });
  return delivery;
}

export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const DEMO_WEBHOOKS: Webhook[] = [
  {
    id: 'wh_demo_orders', url: 'https://hooks.northstar.dev/gameworld/orders', active: true, failureCount: 0,
    events: ['ORDER_CREATED', 'ORDER_PAID', 'ORDER_REFUNDED'], description: 'Sync paid orders into our fulfillment queue.',
    lastDeliveryAt: hoursAgo(2), createdAt: daysAgo(48),
  },
  {
    id: 'wh_demo_publish', url: 'https://api.voltframe.io/webhooks/gameworld', active: true, failureCount: 2,
    events: ['WORLD_PUBLISHED', 'GAME_PUBLISHED', 'ASSET_PUBLISHED'], description: 'Trigger CDN cache warm on publish.',
    lastDeliveryAt: hoursAgo(11), createdAt: daysAgo(30),
  },
  {
    id: 'wh_demo_ai', url: 'https://staging.duskgate.gg/hooks/ai-usage', active: false, failureCount: 14,
    events: ['AI_TOOL_EXECUTED', 'AI_TOOL_DENIED'], description: 'Disabled — repeated 5xx from staging endpoint.',
    lastDeliveryAt: daysAgo(6), createdAt: daysAgo(90),
  },
];

export const DEMO_DELIVERIES: Record<string, WebhookDelivery[]> = {
  wh_demo_orders: [
    { id: 'dlv_demo_1', event: 'ORDER_PAID', status: 'SUCCESS', statusCode: 200, attemptedAt: hoursAgo(2), durationMs: 118 },
    { id: 'dlv_demo_2', event: 'ORDER_CREATED', status: 'SUCCESS', statusCode: 200, attemptedAt: hoursAgo(5), durationMs: 96 },
  ],
  wh_demo_publish: [
    { id: 'dlv_demo_3', event: 'WORLD_PUBLISHED', status: 'FAILED', statusCode: 503, attemptedAt: hoursAgo(11), durationMs: 4021 },
    { id: 'dlv_demo_4', event: 'GAME_PUBLISHED', status: 'SUCCESS', statusCode: 200, attemptedAt: hoursAgo(30), durationMs: 142 },
  ],
  wh_demo_ai: [
    { id: 'dlv_demo_5', event: 'AI_TOOL_EXECUTED', status: 'FAILED', statusCode: 500, attemptedAt: daysAgo(6), durationMs: 812 },
  ],
};
