// developer module (§9): webhook CRUD + the bus-driven webhook dispatcher, plus a read-only
// integrations listing for the developer portal.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { getLogger } from '../../logger.js';
import { startWebhookDispatcher } from './webhookDispatcher.js';

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().max(500).optional(),
  active: z.boolean().default(true),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeWebhook(webhook: any, includeSecret: boolean) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    ...(includeSecret ? { secret: webhook.secret } : {}),
    active: webhook.active,
    description: webhook.description ?? null,
    lastDeliveryAt: webhook.lastDeliveryAt ? new Date(webhook.lastDeliveryAt).toISOString() : null,
    failureCount: webhook.failureCount,
    createdAt: (webhook.createdAt instanceof Date ? webhook.createdAt : new Date(webhook.createdAt)).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeIntegration(integration: any) {
  return {
    id: integration.id,
    provider: integration.provider,
    name: integration.name,
    status: integration.status,
    version: integration.version ?? null,
    docsUrl: integration.docsUrl ?? null,
    config: integration.config ?? undefined,
    connectedAt: integration.connectedAt ? new Date(integration.connectedAt).toISOString() : null,
  };
}

export async function registerDeveloperModule(app: FastifyInstance): Promise<void> {
  // Start the bus → webhook fan-out once per process. Unsubscribes cleanly on shutdown.
  const unsubscribe = startWebhookDispatcher({ bus: app.bus, db: app.db, config: app.config, log: getLogger() });
  app.addHook('onClose', () => unsubscribe());

  app.get('/developer/webhooks', { preHandler: [app.authenticate] }, async (request) => {
    const webhooks = await app.db.webhook.findMany({ where: { ownerId: request.user!.userId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return { items: webhooks.map((w: unknown) => serializeWebhook(w, false)) };
  });

  app.get('/developer/webhooks/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const webhook = await app.db.webhook.findUnique({ where: { id } });
    if (!webhook || webhook.ownerId !== request.user!.userId || webhook.deletedAt) throw AppError.notFound('Webhook', id);
    return serializeWebhook(webhook, false);
  });

  app.post('/developer/webhooks', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateWebhookSchema.parse(request.body);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const webhook = await app.db.webhook.create({
      data: {
        ownerId: request.user!.userId,
        url: body.url,
        events: body.events,
        description: body.description ?? null,
        active: body.active,
        secret,
        failureCount: 0,
      },
    });
    reply.status(201);
    // The secret is only ever returned on creation — store it now, it can't be retrieved again.
    return serializeWebhook(webhook, true);
  });

  app.patch('/developer/webhooks/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await app.db.webhook.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== request.user!.userId || existing.deletedAt) throw AppError.notFound('Webhook', id);
    const body = UpdateWebhookSchema.parse(request.body);
    const updated = await app.db.webhook.update({ where: { id }, data: body });
    return serializeWebhook(updated, false);
  });

  app.delete('/developer/webhooks/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.db.webhook.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== request.user!.userId || existing.deletedAt) throw AppError.notFound('Webhook', id);
    await app.db.webhook.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    reply.status(204);
    return null;
  });

  app.get('/developer/integrations', async () => {
    const integrations = await app.db.integration.findMany({ orderBy: { provider: 'asc' } });
    return { items: integrations.map(serializeIntegration) };
  });
}
