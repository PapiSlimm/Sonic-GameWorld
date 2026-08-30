// notifications module (§9): list + mark-read. Also exports `createNotification` for other
// modules (developer webhook failures, creator payouts, etc.) to enqueue one without importing
// route internals.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import type { PrismaLike } from '../../db.js';

const NotificationListQuerySchema = PaginationQuerySchema.extend({
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}

/** Reusable across modules: insert a notification row. Never throws for "notify best-effort"
 * call sites — callers that care about failures should await + handle themselves. */
export async function createNotification(prisma: PrismaLike, input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      data: input.data ?? undefined,
      read: false,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeNotification(n: any) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    read: n.read,
    createdAt: (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)).toISOString(),
    data: n.data ?? undefined,
  };
}

export async function registerNotificationsModule(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: [app.authenticate] }, async (request) => {
    const query = NotificationListQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = { userId: request.user!.userId };
    if (query.unreadOnly) where.read = false;
    const rows = await app.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeNotification), query);
  });

  app.post('/notifications/:id/read', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const notification = await app.db.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== request.user!.userId) {
      throw AppError.notFound('Notification', id);
    }
    const updated = await app.db.notification.update({ where: { id }, data: { read: true } });
    return serializeNotification(updated);
  });
}
