// Webhook dispatcher: subscribes to the event bus and POSTs matching domain events to every
// active webhook, HMAC-signing the body so subscribers can verify authenticity.
import { createHmac, randomUUID } from 'node:crypto';
import type { DomainEvent } from '@sonic-gameworld/events';
import type { AppConfig } from '../../config.js';
import type { PrismaLike } from '../../db.js';
import type { EventBus } from '../../bus.js';
import type { Logger } from '../../logger.js';

export type FetchLike = typeof fetch;

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  failureCount: number;
}

/** `sha256=<hex hmac>` — subscribers recompute this over the raw body with their stored secret. */
export function computeSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export interface DispatchResult {
  webhookId: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Deliver a single event to a single webhook. Exported standalone for unit testing without
 * spinning up the bus subscription loop. */
export async function deliverToWebhook(
  webhook: WebhookRow,
  event: DomainEvent,
  opts: { timeoutMs: number; fetchImpl?: FetchLike },
): Promise<DispatchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = JSON.stringify({ id: event.id, type: event.type, occurredAt: event.occurredAt, payload: event.payload });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-gameworld-event': event.type,
    'x-gameworld-delivery': randomUUID(),
  };
  if (webhook.secret) headers['x-gameworld-signature'] = computeSignature(webhook.secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetchImpl(webhook.url, { method: 'POST', headers, body, signal: controller.signal });
    return { webhookId: webhook.id, ok: res.ok, status: res.status };
  } catch (err) {
    return { webhookId: webhook.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function matches(webhook: Pick<WebhookRow, 'events'>, eventType: string): boolean {
  return webhook.events.includes('*') || webhook.events.includes(eventType);
}

/** Subscribe to every domain event and fan it out to matching active webhooks. Returns an
 * unsubscribe function (call it from an `onClose` hook). */
export function startWebhookDispatcher(deps: { bus: EventBus; db: PrismaLike; config: AppConfig; log: Logger; fetchImpl?: FetchLike }): () => void {
  const { bus, db, config, log, fetchImpl } = deps;

  return bus.subscribe('*', (event) => {
    void (async () => {
      const webhooks = (await db.webhook.findMany({ where: { active: true, deletedAt: null } })) as WebhookRow[];
      const targets = webhooks.filter((w) => matches(w, event.type));
      await Promise.all(
        targets.map(async (webhook) => {
          const result = await deliverToWebhook(webhook, event, { timeoutMs: config.webhook.timeoutMs, fetchImpl });
          if (result.ok) {
            await db.webhook.update({ where: { id: webhook.id }, data: { lastDeliveryAt: new Date(), failureCount: 0 } }).catch(() => undefined);
          } else {
            const failureCount = webhook.failureCount + 1;
            const disable = failureCount >= config.webhook.maxFailures;
            log.warn({ webhookId: webhook.id, event: event.type, error: result.error, status: result.status, failureCount, disabled: disable }, 'webhook delivery failed');
            await db.webhook
              .update({ where: { id: webhook.id }, data: { failureCount, ...(disable ? { active: false } : {}) } })
              .catch(() => undefined);
          }
        }),
      );
    })().catch((err) => log.error({ err, event: event.type }, 'webhook dispatch loop failed'));
  });
}
