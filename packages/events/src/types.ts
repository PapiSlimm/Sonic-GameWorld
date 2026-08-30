export const EVENT_TYPES = [
  'USER_REGISTERED', 'CREATOR_ACTIVATED', 'ORG_CREATED',
  'ASSET_UPLOADED', 'ASSET_PROCESSED', 'ASSET_REJECTED', 'ASSET_PUBLISHED',
  'WORLD_CREATED', 'WORLD_UPDATED', 'WORLD_PUBLISHED', 'WORLD_SNAPSHOT_CREATED',
  'GAME_CREATED', 'GAME_PUBLISHED', 'GAME_SESSION_STARTED', 'GAME_SESSION_ENDED',
  'RTS_MATCH_START',
  'PRODUCT_LISTED', 'PRODUCT_UPDATED', 'PRODUCT_DELISTED',
  'ORDER_CREATED', 'ORDER_PAID', 'PLAYER_PURCHASED_ASSET', 'ORDER_REFUNDED',
  'ROYALTY_ACCRUED', 'PAYOUT_REQUESTED', 'PAYOUT_SENT',
  'AI_TOOL_REQUESTED', 'AI_TOOL_EXECUTED', 'AI_TOOL_DENIED',
  'MISSION_CREATED', 'NPC_CREATED', 'REVIEW_CREATED',
  'MODERATION_FLAGGED', 'MODERATION_RESOLVED', 'FRAUD_SIGNAL',
  'ANALYTICS_EVENT',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEvent<T extends string = string, P = unknown> {
  id: string;
  type: T;
  occurredAt: string;
  actorId?: string;
  orgId?: string;
  payload: P;
  version: 1;
}

/** Typed payload map. Unlisted event types default to `Record<string, unknown>`. */
export interface EventPayloads {
  USER_REGISTERED: { userId: string; email: string; tier: string };
  CREATOR_ACTIVATED: { userId: string; creatorId: string; handle: string };
  ORG_CREATED: { orgId: string; ownerId: string; name: string };
  ASSET_UPLOADED: { assetId: string; versionId: string; creatorId: string; fileName: string; sizeBytes: number };
  ASSET_PROCESSED: { assetId: string; versionId: string; variants: string[]; qualityScore?: number };
  ASSET_REJECTED: { assetId: string; versionId: string; stage: string; reason: string };
  ASSET_PUBLISHED: { assetId: string; productId?: string; creatorId: string };
  WORLD_CREATED: { worldId: string; ownerId: string; name: string };
  WORLD_UPDATED: { worldId: string; changedBy: string; summary: string };
  WORLD_PUBLISHED: { worldId: string; productId?: string; versionId: string };
  WORLD_SNAPSHOT_CREATED: { worldId: string; snapshotId: string; label?: string };
  GAME_CREATED: { gameId: string; worldId: string; ownerId: string };
  GAME_PUBLISHED: { gameId: string; versionId: string; productId?: string };
  GAME_SESSION_STARTED: { sessionId: string; gameId: string; hostId?: string; maxPlayers: number };
  GAME_SESSION_ENDED: { sessionId: string; gameId: string; durationS: number; players: number };
  /** docs/RTS-CONTRACTS.md §5: broadcast on `session:<id>` once every RTS lobby player is ready,
   * carrying everything every peer needs to call `createMatch()` with identical arguments. */
  RTS_MATCH_START: {
    sessionId: string;
    gameId: string;
    seed: number;
    mapWidthM: number;
    mapDepthM: number;
    cellSizeM: number;
    difficulty: 'Beginner' | 'Intermediate' | 'Pro';
    factions: { factionId: string; isAIControlled: boolean }[];
    factionAssignments: Record<string, string | null>;
  };
  PRODUCT_LISTED: { productId: string; creatorId: string; category: string; priceCents: number };
  PRODUCT_UPDATED: { productId: string; versionId?: string };
  PRODUCT_DELISTED: { productId: string; reason?: string };
  ORDER_CREATED: { orderId: string; buyerId: string; totalCents: number; items: number };
  ORDER_PAID: { orderId: string; buyerId: string; totalCents: number; paymentRef: string };
  PLAYER_PURCHASED_ASSET: { orderId: string; orderItemId: string; buyerId: string; productId: string; creatorId: string; priceCents: number; feeCents: number; royaltyCents: number };
  ORDER_REFUNDED: { orderId: string; amountCents: number; reason?: string };
  ROYALTY_ACCRUED: { royaltyId: string; creatorId: string; orderItemId: string; amountCents: number };
  PAYOUT_REQUESTED: { payoutId: string; creatorId: string; amountCents: number };
  PAYOUT_SENT: { payoutId: string; creatorId: string; amountCents: number; providerRef: string };
  AI_TOOL_REQUESTED: { executionId: string; worldId?: string; tool: string; role: string; args: Record<string, unknown> };
  AI_TOOL_EXECUTED: { executionId: string; worldId?: string; tool: string; role: string; result: unknown; durationMs: number };
  AI_TOOL_DENIED: { executionId: string; worldId?: string; tool: string; reason: string };
  MISSION_CREATED: { missionId: string; worldId: string; name: string };
  NPC_CREATED: { npcId: string; worldId?: string; name: string };
  REVIEW_CREATED: { reviewId: string; productId: string; rating: number; authorId: string };
  MODERATION_FLAGGED: { itemId: string; refKind: string; refId: string; stage: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; reason: string };
  MODERATION_RESOLVED: { itemId: string; resolution: 'APPROVED' | 'REJECTED' | 'ESCALATED'; moderatorId: string };
  FRAUD_SIGNAL: { signalId: string; userId?: string; orderId?: string; score: number; signals: string[] };
  ANALYTICS_EVENT: { name: string; sessionId?: string; userId?: string; gameId?: string; worldId?: string; props: Record<string, unknown> };
}

export type PayloadOf<T extends string> = T extends keyof EventPayloads ? EventPayloads[T] : Record<string, unknown>;
export type TypedEvent<T extends EventType = EventType> = DomainEvent<T, PayloadOf<T>>;

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: EventType | (string & {}) | '*', handler: EventHandler): Unsubscribe;
  close(): Promise<void>;
}

/** Fan-out targets per spec §7 — which downstream consumers each event must reach. */
export type FanoutTarget = 'billing' | 'creator' | 'analytics' | 'inventory' | 'search' | 'marketplace' | 'recommendation' | 'notifications' | 'moderation' | 'realtime';

export const FANOUT: Partial<Record<EventType, FanoutTarget[]>> = {
  PLAYER_PURCHASED_ASSET: ['billing', 'creator', 'analytics', 'inventory'],
  GAME_PUBLISHED: ['search', 'marketplace', 'recommendation'],
  WORLD_PUBLISHED: ['search', 'marketplace', 'recommendation'],
  ASSET_PUBLISHED: ['search', 'marketplace', 'recommendation'],
  PRODUCT_LISTED: ['search', 'marketplace', 'recommendation'],
  PRODUCT_UPDATED: ['search', 'marketplace'],
  PRODUCT_DELISTED: ['search', 'marketplace', 'recommendation'],
  ORDER_PAID: ['billing', 'analytics', 'notifications'],
  ORDER_REFUNDED: ['billing', 'creator', 'analytics'],
  ROYALTY_ACCRUED: ['creator', 'billing'],
  PAYOUT_SENT: ['creator', 'notifications'],
  ASSET_UPLOADED: ['moderation'],
  REVIEW_CREATED: ['creator', 'moderation', 'analytics'],
  MODERATION_FLAGGED: ['moderation', 'notifications'],
  FRAUD_SIGNAL: ['moderation', 'billing'],
  AI_TOOL_EXECUTED: ['realtime', 'analytics'],
  WORLD_UPDATED: ['realtime'],
  GAME_SESSION_STARTED: ['analytics', 'realtime'],
  GAME_SESSION_ENDED: ['analytics', 'realtime'],
  RTS_MATCH_START: ['realtime'],
  ANALYTICS_EVENT: ['analytics'],
};

export function fanoutTargets(type: string): FanoutTarget[] {
  return (FANOUT as Record<string, FanoutTarget[] | undefined>)[type] ?? [];
}
