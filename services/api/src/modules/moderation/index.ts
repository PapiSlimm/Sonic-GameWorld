// moderation module (§9, §13 moderation pipeline: MALWARE -> AI_SAFETY -> LICENSE ->
// CONTENT_POLICY -> HUMAN_REVIEW -> PUBLISH): the human-review queue + report intake, plus the
// anti-fraud module (fraud.ts) other modules (orders, marketplace reviews) call into.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { MODERATION_HUMAN_REVIEW_STAGE_INDEX } from '../../queues.js';

export * from './fraud.js';

const ModerationRefKindSchema = z.enum(['ASSET', 'PRODUCT', 'WORLD', 'GAME', 'REVIEW', 'USER', 'NPC']);
const ModerationStatusSchema = z.enum(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED']);
const ModerationSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const QueueQuerySchema = PaginationQuerySchema.extend({
  status: ModerationStatusSchema.optional(),
  severity: ModerationSeveritySchema.optional(),
  refKind: ModerationRefKindSchema.optional(),
  stage: z.string().optional(),
});

const ReportBodySchema = z.object({
  refKind: ModerationRefKindSchema,
  refId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  severity: ModerationSeveritySchema.optional(),
});

const ResolveBodySchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
  notes: z.string().max(2000).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeItem(item: any) {
  return {
    id: item.id,
    refKind: item.refKind,
    refId: item.refId,
    stage: item.stage,
    status: item.status,
    severity: item.severity,
    reason: item.reason,
    reporterId: item.reporterId ?? null,
    assigneeId: item.assigneeId ?? null,
    aiVerdictLabel: item.aiVerdictLabel ?? null,
    aiVerdictConfidence: item.aiVerdictConfidence ?? null,
    aiVerdictNotes: item.aiVerdictNotes ?? null,
    resolutionAction: item.resolutionAction ?? null,
    resolutionNotes: item.resolutionNotes ?? null,
    createdAt: new Date(item.createdAt).toISOString(),
    resolvedAt: item.resolvedAt ? new Date(item.resolvedAt).toISOString() : null,
  };
}

/** Reusable by other modules (marketplace reviews, orders fraud checks) so "flag this thing" is a
 * single well-known call rather than each module hand-rolling ModerationItem.create + the event. */
export async function flagForModeration(
  app: FastifyInstance,
  input: { refKind: string; refId: string; stage: string; reason: string; severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; reporterId?: string },
) {
  const item = await app.db.moderationItem.create({
    data: {
      refKind: input.refKind,
      refId: input.refId,
      stage: input.stage,
      status: 'PENDING',
      severity: input.severity ?? 'LOW',
      reason: input.reason,
      reporterId: input.reporterId ?? null,
    },
  });
  await app.bus.publish(
    createEvent({ type: 'MODERATION_FLAGGED', payload: { itemId: item.id, refKind: item.refKind, refId: item.refId, stage: item.stage, severity: item.severity, reason: item.reason } }),
  );
  return item;
}

export async function registerModerationModule(app: FastifyInstance): Promise<void> {
  // GET /moderation/queue — moderator/admin only.
  app.get('/moderation/queue', { preHandler: [app.authenticate, app.requireRole('moderator', 'admin', 'platform_admin')] }, async (request) => {
    const query = QueueQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    else where.status = { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] }; // default: only the open queue
    if (query.severity) where.severity = query.severity;
    if (query.refKind) where.refKind = query.refKind;
    if (query.stage) where.stage = query.stage;

    const rows = await app.db.moderationItem.findMany({ where, orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }], ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeItem), query);
  });

  // POST /moderation/report — any authenticated user can report content.
  app.post('/moderation/report', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = ReportBodySchema.parse(request.body);
    const item = await flagForModeration(app, { ...body, stage: 'USER_REPORT', reporterId: request.user!.userId });
    await app.queues.moderationScan.add('scan', {
      refKind: body.refKind,
      refId: body.refId,
      reporterId: request.user!.userId,
      reason: body.reason,
    });
    reply.status(201);
    return serializeItem(item);
  });

  // POST /moderation/:id/resolve — moderator/admin only.
  app.post('/moderation/:id/resolve', { preHandler: [app.authenticate, app.requireRole('moderator', 'admin', 'platform_admin')] }, async (request) => {
    const { id } = request.params as { id: string };
    const item = await app.db.moderationItem.findUnique({ where: { id } });
    if (!item) throw AppError.notFound('ModerationItem', id);
    const body = ResolveBodySchema.parse(request.body);

    const statusForAction = { APPROVED: 'APPROVED', REJECTED: 'REJECTED', ESCALATED: 'ESCALATED' } as const;
    const updated = await app.db.moderationItem.update({
      where: { id },
      data: {
        status: statusForAction[body.action],
        assigneeId: request.user!.userId,
        resolutionAction: body.action,
        resolutionNotes: body.notes ?? null,
        resolvedAt: body.action === 'ESCALATED' ? null : new Date(),
      },
    });

    // Rejecting a listed product removes it from sale + search.
    if (body.action === 'REJECTED' && item.refKind === 'PRODUCT') {
      const product = await app.db.product.findUnique({ where: { id: item.refId } });
      if (product) {
        await app.db.product.update({ where: { id: product.id }, data: { status: 'DELISTED' } });
        await app.searchService.remove('product', product.id);
        await app.bus.publish(createEvent({ type: 'PRODUCT_DELISTED', payload: { productId: product.id, reason: 'moderation_rejected' } }));
      }
    }

    await app.bus.publish(createEvent({ type: 'MODERATION_RESOLVED', payload: { itemId: updated.id, resolution: body.action, moderatorId: request.user!.userId } }));

    // Resume the paused pipeline (workers/moderation) from HUMAN_REVIEW so it can continue to
    // PUBLISH (or stop, for a rejection) — see that worker's README's resume contract.
    // Resolutions HUMAN_REVIEW knows how to resume are APPROVED/REJECTED only; ESCALATED just
    // reassigns the case for further human review and isn't re-enqueued.
    if (body.action === 'APPROVED' || body.action === 'REJECTED') {
      await app.queues.moderationScan.add('scan', {
        refKind: item.refKind as 'ASSET' | 'PRODUCT' | 'WORLD' | 'GAME' | 'REVIEW' | 'USER' | 'NPC',
        refId: item.refId,
        itemId: item.id,
        resolution: body.action,
        resumeFromIndex: MODERATION_HUMAN_REVIEW_STAGE_INDEX,
      });
    }

    return serializeItem(updated);
  });
}
