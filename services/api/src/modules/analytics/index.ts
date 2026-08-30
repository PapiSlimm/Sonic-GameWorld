// analytics module (§9): event ingest + overview/creator/game aggregates.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { averageSessionSeconds, buildOverview, computeRetention, parseRange, peakConcurrentPlayers } from './aggregate.js';

const AnalyticsEventInputSchema = z.object({
  name: z.string().min(1).max(120),
  timestamp: z.string().datetime().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  gameId: z.string().optional(),
  worldId: z.string().optional(),
  productId: z.string().optional(),
  props: z.record(z.unknown()).optional(),
});

const IngestBodySchema = z.union([AnalyticsEventInputSchema, z.array(AnalyticsEventInputSchema).min(1).max(500)]);

const AnalyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH']).optional(),
});

export async function registerAnalyticsModule(app: FastifyInstance): Promise<void> {
  // POST /analytics/events — accepts one event or a batch; each becomes an AnalyticsEvent row +
  // an ANALYTICS_EVENT bus publish (fan-out target: analytics, per §7 FANOUT).
  app.post('/analytics/events', async (request, reply) => {
    const parsed = IngestBodySchema.parse(request.body);
    const events = Array.isArray(parsed) ? parsed : [parsed];

    let accepted = 0;
    let rejected = 0;
    for (const input of events) {
      try {
        await app.db.analyticsEvent.create({
          data: {
            name: input.name,
            timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
            sessionId: input.sessionId ?? null,
            userId: input.userId ?? null,
            gameId: input.gameId ?? null,
            worldId: input.worldId ?? null,
            productId: input.productId ?? null,
            props: input.props ?? undefined,
          },
        });
        await app.bus.publish(
          createEvent({
            type: 'ANALYTICS_EVENT',
            payload: { name: input.name, sessionId: input.sessionId, userId: input.userId, gameId: input.gameId, worldId: input.worldId, props: input.props ?? {} },
          }),
        );
        accepted += 1;
      } catch (err) {
        request.log.warn({ err, input }, 'failed to ingest analytics event');
        rejected += 1;
      }
    }
    reply.status(202);
    return { accepted, rejected };
  });

  // GET /analytics — platform-wide overview for the requested window.
  app.get('/analytics', { preHandler: [app.authenticate, app.requireRole('platform_admin', 'admin')] }, async (request) => {
    const query = AnalyticsQuerySchema.parse(request.query ?? {});
    const range = parseRange(query);
    const events = await app.db.analyticsEvent.findMany({ where: { timestamp: { gte: range.from, lte: range.to } }, take: 10000, orderBy: { timestamp: 'asc' } });
    const { totals, series } = buildOverview(events, range, query.granularity);
    return { period: { from: range.from.toISOString(), to: range.to.toISOString() }, totals, series };
  });

  // GET /analytics/creator — the caller's own product performance for the requested window.
  app.get('/analytics/creator', { preHandler: [app.authenticate] }, async (request) => {
    const query = AnalyticsQuerySchema.parse(request.query ?? {});
    const range = parseRange(query);
    const profile = await app.db.creatorProfile.findUnique({ where: { userId: request.user!.userId } });
    if (!profile) throw AppError.notFound('Creator profile');

    const products = await app.db.product.findMany({ where: { creatorId: profile.id } });
    const productIds = products.map((p: { id: string }) => p.id);

    const events = productIds.length > 0
      ? await app.db.analyticsEvent.findMany({ where: { productId: { in: productIds }, timestamp: { gte: range.from, lte: range.to } }, take: 10000, orderBy: { timestamp: 'asc' } })
      : [];
    const { totals, series } = buildOverview(events, range, query.granularity);

    const orderItems = productIds.length > 0 ? await app.db.orderItem.findMany({ where: { productId: { in: productIds } } }) : [];
    const revenueByProduct = new Map<string, number>();
    for (const oi of orderItems as Array<{ productId: string; unitPriceCents: number; quantity: number; feeCents: number }>) {
      revenueByProduct.set(oi.productId, (revenueByProduct.get(oi.productId) ?? 0) + oi.unitPriceCents * oi.quantity - oi.feeCents);
    }
    const viewsByProduct = new Map<string, number>();
    for (const e of events as Array<{ productId: string | null; name: string }>) {
      if (e.productId && e.name === 'product_view') viewsByProduct.set(e.productId, (viewsByProduct.get(e.productId) ?? 0) + 1);
    }

    const productBreakdown = products.map((p: { id: string; name: string; sales: number }) => {
      const views = viewsByProduct.get(p.id) ?? 0;
      return {
        productId: p.id,
        name: p.name,
        views,
        sales: p.sales,
        revenueCents: revenueByProduct.get(p.id) ?? 0,
        conversion: views > 0 ? Math.round((p.sales / views) * 1000) / 1000 : 0,
      };
    });

    return { period: { from: range.from.toISOString(), to: range.to.toISOString() }, totals, series, products: productBreakdown };
  });

  // GET /analytics/game/:id — session/retention/engagement aggregates for one game.
  app.get('/analytics/game/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id: gameId } = request.params as { id: string };
    const game = await app.db.game.findUnique({ where: { id: gameId } });
    if (!game || game.deletedAt) throw AppError.notFound('Game', gameId);

    const query = AnalyticsQuerySchema.parse(request.query ?? {});
    const range = parseRange(query);

    const events = await app.db.analyticsEvent.findMany({ where: { gameId, timestamp: { gte: range.from, lte: range.to } }, take: 10000, orderBy: { timestamp: 'asc' } });
    const { totals, series } = buildOverview(events, range, query.granularity);

    const sessions = await app.db.gameSession.findMany({ where: { gameId } });
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    const players = sessionIds.length > 0 ? await app.db.gameSessionPlayer.findMany({ where: { sessionId: { in: sessionIds } } }) : [];

    return {
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      totals,
      series,
      retention: computeRetention(players),
      avgSessionS: averageSessionSeconds(sessions),
      peakConcurrent: peakConcurrentPlayers(players),
    };
  });
}
