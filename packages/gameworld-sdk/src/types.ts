import type {
  AIAgentRole,
  AIToolName,
  AssetPassport,
  AssetVariant,
  CameraRig,
  CinematicSequence,
  EngineTarget,
  Genre,
  LicenseCompatibility,
  LicenseIntent,
  LicenseRecord,
  MissionDefinition,
  NPCDefinition,
  PlanTier,
  ProductCategory,
  Role,
  ToolCall,
  WorldDocument,
  WorldEntity,
  WorldEntityInput,
} from '@sonic-gameworld/world-schema';

export type {
  AIAgentRole, AIToolName, AssetPassport, AssetVariant, CameraRig, CinematicSequence, EngineTarget, Genre,
  LicenseCompatibility, LicenseIntent, LicenseRecord, MissionDefinition, NPCDefinition, PlanTier, ProductCategory, Role,
  ToolCall, WorldDocument, WorldEntity, WorldEntityInput,
};

// ---------- Envelope & common ----------
export interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface PageQuery { cursor?: string; limit?: number }
export type ISODate = string;
export type Cents = number;

// ---------- Auth & identity ----------
export interface AuthTokens { accessToken: string; refreshToken?: string; expiresIn: number; tokenType: 'Bearer' }
export interface AuthContext { userId: string; orgId?: string; roles: Role[]; tier: PlanTier; apiKeyId?: string }
export interface User {
  id: string; email: string; handle: string; displayName: string; avatarUrl?: string | null; tier: PlanTier;
  roles: Role[]; orgId?: string | null; emailVerified: boolean; createdAt: ISODate; updatedAt: ISODate;
}
export type UserPatch = Partial<Pick<User, 'displayName' | 'avatarUrl' | 'handle'>> & { bio?: string; settings?: Record<string, unknown> };
export interface DevLoginInput { email: string; displayName?: string }
export interface FirebaseLoginInput { idToken: string }
export interface AuthSession { tokens: AuthTokens; user: User }
export interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt?: ISODate | null; createdAt: ISODate; expiresAt?: ISODate | null }
export interface ApiKeyCreated extends ApiKey { key: string }
export interface CreateApiKeyInput { name: string; scopes?: string[]; expiresAt?: ISODate }

export interface Organization { id: string; name: string; slug: string; tier: PlanTier; ownerId: string; logoUrl?: string | null; createdAt: ISODate; updatedAt: ISODate }
export interface CreateOrgInput { name: string; slug?: string }
export interface OrgMember { userId: string; orgId: string; role: Role; joinedAt: ISODate; user?: Pick<User, 'id' | 'handle' | 'displayName' | 'avatarUrl'> }
export interface AddOrgMemberInput { userId?: string; email?: string; role: Role }

// ---------- Creators ----------
export interface CreatorProfile {
  id: string; userId: string; handle: string; displayName: string; bio?: string | null; avatarUrl?: string | null; bannerUrl?: string | null;
  website?: string | null; socials?: Record<string, string>; verified: boolean; followers: number; productCount: number; createdAt: ISODate;
}
export interface CreatorReputation {
  score: number; quality: number; reliability: number; sales: number; updates: number; reviews: number; support: number; originality: number; compliance: number; computedAt: ISODate;
}
export interface CreatorPassport {
  profile: CreatorProfile; reputation: CreatorReputation; badges: string[]; stats: { totalSales: number; totalRevenueCents: Cents; averageRating: number; ratingCount: number };
  featuredProducts: ProductSummary[];
}
export interface CreatorDashboard {
  revenueCents: Cents; revenueDeltaPct: number; sales: number; salesDeltaPct: number; followers: number; averageRating: number; reputation: CreatorReputation;
  timeseries: { date: string; revenueCents: Cents; sales: number; views: number }[]; topProducts: (ProductSummary & { sales: number; revenueCents: Cents })[];
  pendingPayoutCents: Cents;
}
export interface CreatorBalance { availableCents: Cents; pendingCents: Cents; lifetimeCents: Cents; currency: string; nextPayoutAt?: ISODate | null }
export interface Payout { id: string; creatorId: string; amountCents: Cents; currency: string; status: 'REQUESTED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED'; provider: string; providerRef?: string | null; requestedAt: ISODate; sentAt?: ISODate | null }
export interface RequestPayoutInput { amountCents?: Cents; method?: 'STRIPE_CONNECT' | 'MANUAL' }
export type CreatorPatch = Partial<Pick<CreatorProfile, 'displayName' | 'bio' | 'avatarUrl' | 'bannerUrl' | 'website' | 'socials'>>;

// ---------- Worlds ----------
export type WorldStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface World {
  id: string; ownerId: string; orgId?: string | null; name: string; slug: string; description: string; genre: Genre[]; status: WorldStatus;
  sizeKm2: number; maxPlayers: number; thumbnailUrl?: string | null; currentVersionId?: string | null; entityCount: number; createdAt: ISODate; updatedAt: ISODate; publishedAt?: ISODate | null;
}
export interface CreateWorldInput { name: string; description?: string; genre?: Genre[]; sizeKm2?: number; maxPlayers?: number; template?: string; orgId?: string; document?: WorldDocument }
export type WorldPatch = Partial<Pick<World, 'name' | 'description' | 'genre' | 'sizeKm2' | 'maxPlayers' | 'thumbnailUrl'>>;
export interface WorldListQuery extends PageQuery { status?: WorldStatus; genre?: Genre; ownerId?: string; q?: string }
export interface WorldSnapshot { id: string; worldId: string; versionId: string; label?: string | null; createdBy: string; createdAt: ISODate; entityCount: number; sizeBytes: number }
export interface CreateSnapshotInput { label?: string }
export interface PublishWorldInput { visibility?: 'PUBLIC' | 'UNLISTED'; productId?: string; priceCents?: Cents; category?: ProductCategory; notes?: string }
export interface PublishResult { worldId: string; versionId: string; productId?: string; status: 'PUBLISHED' | 'PENDING_REVIEW' }
export interface ForgeInput { lat: number; lon: number; radiusKm: number; theme?: string; name?: string }
export interface ForgeResult { worldId: string; document: WorldDocument; stats: { buildings: number; roads: number; water: number; regions: number }; sources: string[] }
export type EntityPatch = Partial<Omit<WorldEntityInput, 'id'>>;

// ---------- Games & sessions ----------
export type GameStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface Game {
  id: string; worldId: string; ownerId: string; name: string; slug: string; description: string; genre: Genre[]; engines: EngineTarget[]; status: GameStatus;
  maxPlayers: number; modes: string[]; thumbnailUrl?: string | null; currentVersionId?: string | null; playerCount: number; rating: number; createdAt: ISODate; updatedAt: ISODate;
}
export interface CreateGameInput { worldId: string; name: string; description?: string; genre?: Genre[]; engines?: EngineTarget[]; maxPlayers?: number; modes?: string[] }
export type GamePatch = Partial<Pick<Game, 'name' | 'description' | 'genre' | 'engines' | 'maxPlayers' | 'modes' | 'thumbnailUrl'>>;
export interface GameListQuery extends PageQuery { status?: GameStatus; genre?: Genre; worldId?: string; q?: string }
export type SessionStatus = 'LOBBY' | 'RUNNING' | 'ENDED';
export interface GameSession {
  id: string; gameId: string; hostId?: string | null; serverId?: string | null; status: SessionStatus; mode?: string | null; region?: string | null;
  players: { userId: string; joinedAt: ISODate; leftAt?: ISODate | null }[]; maxPlayers: number; startedAt?: ISODate | null; endedAt?: ISODate | null; createdAt: ISODate;
}
export interface CreateSessionInput { mode?: string; region?: string; maxPlayers?: number; private?: boolean }
export interface JoinSessionResult { session: GameSession; connection: { wsUrl: string; token: string; topic: string } }
export interface GameSave { gameId: string; playerId: string; slot: number; data: Record<string, unknown>; version: number; updatedAt: ISODate }
export interface PutGameSaveInput { slot?: number; data: Record<string, unknown> }
export interface LeaderboardEntry { rank: number; playerId: string; handle: string; score: number; metadata?: Record<string, unknown>; achievedAt: ISODate }
export interface SubmitScoreInput { score: number; board?: string; metadata?: Record<string, unknown> }

// ---------- RTS sessions (docs/RTS-CONTRACTS.md §5 — "Global Dominance" game template) ----------
// Deliberately plain (no dependency on @sonic-gameworld/rts-sim types) — these mirror the exact
// wire shape services/api's `POST /games/:id/rts/sessions` and friends return, not rts-sim's
// internal `FactionSetup`/`RTSMatchState` types, keeping this SDK decoupled from the sim package.
export type RtsDifficulty = 'Beginner' | 'Intermediate' | 'Pro';
export interface RtsFactionSetup { factionId: string; isAIControlled: boolean }
export interface RtsSessionInfo {
  sessionId: string;
  gameId: string;
  /** Every peer calls `createMatch({ seed, mapWidthM, mapDepthM, cellSizeM, factions })` with this
   * exact value once `RTS_MATCH_START` arrives — see connectRealtime's message payload. */
  seed: number;
  mapWidthM: number;
  mapDepthM: number;
  cellSizeM: number;
  difficulty: RtsDifficulty;
  factions: RtsFactionSetup[];
  /** factionId -> controlling userId, or null while AI-controlled. */
  factionAssignments: Record<string, string | null>;
  readyUserIds: string[];
}
export interface CreateRtsSessionInput {
  region?: string;
  seed?: number;
  mapWidthM?: number;
  mapDepthM?: number;
  cellSizeM?: number;
  difficulty?: RtsDifficulty;
}
export interface RtsSessionResult { session: GameSession; rts: RtsSessionInfo }
export interface RtsJoinInput { factionId?: string }
export interface RtsReadyResult { session: GameSession; rts: RtsSessionInfo; started: boolean }
/** `RTS_MATCH_START` realtime broadcast payload (`RealtimeMessage<RtsMatchStartPayload>`), carrying
 * everything every peer needs to call `createMatch()` identically. */
export interface RtsMatchStartPayload {
  sessionId: string;
  gameId: string;
  seed: number;
  mapWidthM: number;
  mapDepthM: number;
  cellSizeM: number;
  difficulty: RtsDifficulty;
  factions: RtsFactionSetup[];
  factionAssignments: Record<string, string | null>;
}
export interface LeaderboardQuery { board?: string; limit?: number; around?: string }

// ---------- Assets ----------
export type AssetStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'PUBLISHED' | 'REJECTED';
export type AssetType = 'MODEL' | 'TEXTURE' | 'MATERIAL' | 'AUDIO' | 'VIDEO' | 'ANIMATION' | 'ARCHIVE' | 'IMAGE' | 'OTHER';
export interface PipelineStageState { stage: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED'; startedAt?: ISODate; finishedAt?: ISODate; message?: string; progress?: number }
export interface Asset {
  id: string; creatorId: string; orgId?: string | null; name: string; slug: string; type: AssetType; status: AssetStatus; description?: string | null; tags: string[];
  currentVersionId?: string | null; thumbnailUrl?: string | null; previewUrl?: string | null; sizeBytes: number; polyCount?: number | null; qualityScore?: number | null; createdAt: ISODate; updatedAt: ISODate;
}
export interface AssetVersion { id: string; assetId: string; version: string; fileKey: string; fileName: string; sizeBytes: number; mimeType: string; pipeline: PipelineStageState[]; status: AssetStatus; createdAt: ISODate }
export interface AssetVariantInfo { id: string; versionId: string; variant: AssetVariant; url: string; sizeBytes: number; polyCount?: number | null; textureMaxPx?: number | null; format: string }
export interface UploadUrlInput { fileName: string; contentType: string; sizeBytes: number; assetId?: string }
export interface UploadUrlResult { uploadUrl: string; method: 'PUT'; headers: Record<string, string>; fileKey: string; expiresAt: ISODate; maxSizeBytes: number }
export interface CreateAssetInput { name: string; type?: AssetType; description?: string; tags?: string[]; fileKey: string; fileName: string; sizeBytes: number; contentType: string; license?: LicenseRecord; source?: AssetPassport['source']; orgId?: string }
export interface CreateAssetVersionInput { fileKey: string; fileName: string; sizeBytes: number; contentType: string; version?: string; notes?: string }
export interface AssetListQuery extends PageQuery { type?: AssetType; status?: AssetStatus; q?: string; tag?: string; creatorId?: string }
export interface PublishAssetInput { productId?: string; priceCents?: Cents; category?: ProductCategory; license?: LicenseRecord }

// ---------- NPCs & missions ----------
export interface NPC { id: string; worldId?: string | null; ownerId: string; name: string; definition: NPCDefinition; agentId?: string | null; status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; createdAt: ISODate; updatedAt: ISODate }
export interface CreateNPCInput { worldId?: string; name?: string; definition: Partial<NPCDefinition> & { name: string } }
export type NPCPatch = { name?: string; definition?: Partial<NPCDefinition>; status?: NPC['status'] };
export interface NPCListQuery extends PageQuery { worldId?: string; q?: string }
export interface NPCChatInput { message: string; sessionId?: string; playerId?: string; context?: Record<string, unknown> }
export interface NPCChatResult { reply: string; emotion?: string; actions: ToolCall[]; memoryWritten: boolean; sessionId: string }
export interface GenerateNPCInput { prompt: string; worldId?: string; archetype?: string; faction?: string; count?: number }
export interface Mission { id: string; worldId: string; ownerId: string; name: string; definition: MissionDefinition; status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; createdAt: ISODate; updatedAt: ISODate }
export interface CreateMissionInput { worldId: string; definition: Partial<MissionDefinition> & { name: string } }
export type MissionPatch = { definition?: Partial<MissionDefinition>; status?: Mission['status'] };
export interface MissionListQuery extends PageQuery { worldId?: string; chainId?: string; q?: string }
export interface GenerateMissionInput { worldId: string; prompt: string; difficulty?: number; count?: number; chainId?: string }

// ---------- AI ----------
export interface AICommandInput { worldId: string; text: string; mode?: AIAgentRole; voice?: boolean; sessionId?: string; dryRun?: boolean }
export interface ToolExecution {
  id: string; tool: AIToolName; args: Record<string, unknown>; role: AIAgentRole; ok: boolean; result?: unknown; error?: string; durationMs: number; events: string[]; createdAt: ISODate;
}
export interface AIDenied { tool: AIToolName; args: Record<string, unknown>; reason: string; code: 'PERMISSION' | 'VALIDATION' | 'QUOTA' | 'LICENSE' | 'SAFETY' }
export interface AICommandResult { plan: { role: AIAgentRole; toolCalls: ToolCall[]; rationale?: string }; executed: ToolExecution[]; denied: AIDenied[]; narration: string; usage?: AIUsageSummary }
export interface AIGenerateInput { kind: 'MODEL' | 'TEXTURE' | 'AUDIO' | 'CHARACTER' | 'VEHICLE' | 'ENVIRONMENT' | 'PROP' | 'TEXT' | 'IMAGE'; prompt: string; worldId?: string; style?: string; variants?: AssetVariant[]; params?: Record<string, unknown> }
export interface AIGenerateResult { jobId: string; status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; assetId?: string; outputs?: { url: string; kind: string }[]; text?: string }
export interface AIToolInfo { name: AIToolName; description: string; permission: string; roles: AIAgentRole[]; mutates: boolean; schema: Record<string, unknown> }
export interface AIExecutionListQuery extends PageQuery { worldId?: string; tool?: AIToolName; ok?: boolean }
export interface AIUsageSummary { inputTokens: number; outputTokens: number; costCents: Cents; calls: number }
export interface AIUsage extends AIUsageSummary { period: { from: ISODate; to: ISODate }; byModel: Record<string, AIUsageSummary>; quota?: { limit: number; used: number; resetsAt: ISODate } }

// ---------- Marketplace ----------
export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'DELISTED' | 'REJECTED';
export interface ProductSummary {
  id: string; slug: string; name: string; category: ProductCategory; genre: Genre[]; engines: EngineTarget[]; priceCents: Cents; currency: string; thumbnailUrl?: string | null;
  rating: number; ratingCount: number; sales: number; creator: Pick<CreatorProfile, 'id' | 'handle' | 'displayName' | 'avatarUrl' | 'verified'>; licenseSummary: { commercial: boolean; multiplayer: boolean; attribution: boolean };
  status: ProductStatus; featured: boolean; publishedAt?: ISODate | null;
}
export interface ProductVersion { id: string; productId: string; version: string; changelog?: string | null; assetVersionId?: string | null; worldVersionId?: string | null; gameVersionId?: string | null; fileSizeBytes?: number | null; createdAt: ISODate }
export interface Product extends ProductSummary {
  description: string; longDescription?: string | null; tags: string[]; previewUrls: string[]; modelPreviewUrl?: string | null; license: LicenseRecord; passport?: AssetPassport | null;
  versions: ProductVersion[]; currentVersion?: ProductVersion | null; dependencies: { productId: string; slug: string; name: string }[]; compatibility: { engine: EngineTarget; minVersion?: string; tested: boolean }[];
  refKind: 'ASSET' | 'WORLD' | 'GAME' | 'NPC' | 'MISSION' | 'SYSTEM'; refId: string; spatialPath?: { level: string; name: string; id?: string }[]; createdAt: ISODate; updatedAt: ISODate;
}
export interface CreateProductInput {
  name: string; slug?: string; category: ProductCategory; genre?: Genre[]; engines?: EngineTarget[]; priceCents: Cents; description: string; longDescription?: string; tags?: string[];
  refKind: Product['refKind']; refId: string; license: LicenseRecord; previewUrls?: string[]; thumbnailUrl?: string;
}
export type ProductPatch = Partial<Omit<CreateProductInput, 'refKind' | 'refId'>> & { status?: ProductStatus; featured?: boolean };
export interface CreateProductVersionInput { version: string; changelog?: string; assetVersionId?: string; worldVersionId?: string; gameVersionId?: string }
export interface MarketplaceSearchQuery extends PageQuery { q?: string; category?: ProductCategory; genre?: Genre; engine?: EngineTarget; minPriceCents?: Cents; maxPriceCents?: Cents; free?: boolean; sort?: 'RELEVANCE' | 'NEWEST' | 'TOP_RATED' | 'BEST_SELLING' | 'PRICE_ASC' | 'PRICE_DESC'; creatorId?: string; tag?: string }
export interface SearchResult<T = ProductSummary> extends Page<T> { total: number; facets?: Record<string, { value: string; count: number }[]>; tookMs?: number }
export interface SpatialMapNode { id: string; level: 'ROOT' | 'CATEGORY' | 'GENRE' | 'WORLD' | 'CITY' | 'DISTRICT' | 'BUILDING' | 'ROOM' | 'ASSET' | 'ITEM'; name: string; slug?: string; count: number; thumbnailUrl?: string | null; productId?: string; position?: { x: number; y: number; z: number }; children: SpatialMapNode[] }
export interface MarketplaceMap { root: SpatialMapNode; generatedAt: ISODate }
export interface FeaturedResponse { hero: ProductSummary[]; collections: { id: string; name: string; slug: string; products: ProductSummary[] }[]; trending: ProductSummary[]; newReleases: ProductSummary[]; creators: CreatorProfile[] }
export interface Review { id: string; productId: string; authorId: string; author: Pick<User, 'id' | 'handle' | 'displayName' | 'avatarUrl'>; rating: number; title?: string | null; body: string; verifiedPurchase: boolean; helpful: number; createdAt: ISODate; creatorReply?: { body: string; at: ISODate } | null }
export interface CreateReviewInput { rating: number; title?: string; body: string }
export interface WishlistItem { id: string; productId: string; product: ProductSummary; addedAt: ISODate }
export interface CartItem { id: string; productId: string; product: ProductSummary; versionId?: string | null; quantity: number; unitPriceCents: Cents; addedAt: ISODate }
export interface Cart { id: string; items: CartItem[]; subtotalCents: Cents; discountCents: Cents; taxCents: Cents; totalCents: Cents; currency: string; couponCode?: string | null; updatedAt: ISODate }
export interface AddCartItemInput { productId: string; versionId?: string; quantity?: number }
export type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';
export interface OrderItem { id: string; productId: string; product: ProductSummary; versionId?: string | null; quantity: number; unitPriceCents: Cents; feeCents: Cents; royaltyCents: Cents; licenseId?: string | null }
export interface Order { id: string; buyerId: string; status: OrderStatus; items: OrderItem[]; subtotalCents: Cents; discountCents: Cents; taxCents: Cents; totalCents: Cents; currency: string; paymentProvider: string; paymentRef?: string | null; couponCode?: string | null; createdAt: ISODate; paidAt?: ISODate | null; refundedAt?: ISODate | null }
export interface CreateOrderInput { items?: AddCartItemInput[]; fromCart?: boolean; couponCode?: string; paymentMethod?: 'STRIPE' | 'MOCK' | 'WALLET' }
export interface CreateOrderResult { order: Order; checkout?: { url: string; sessionId: string } | null }
export interface RefundInput { amountCents?: Cents; reason?: string; itemIds?: string[] }
export interface OrderListQuery extends PageQuery { status?: OrderStatus }
export interface LibraryItem { id: string; productId: string; product: ProductSummary; orderId: string; licenseId: string; versionId?: string | null; latestVersionId?: string | null; downloadUrl?: string | null; acquiredAt: ISODate }
export interface LibraryQuery extends PageQuery { category?: ProductCategory; q?: string }

// ---------- Licensing ----------
export interface LicenseCheckInput { licenseIds?: string[]; productIds?: string[]; licenses?: LicenseRecord[]; intent: LicenseIntent }
export interface LicenseCheckResult { status: LicenseCompatibility; reasons: string[]; details: { licenseId: string; status: LicenseCompatibility; reasons: string[] }[] }
export interface ProductLicense { id: string; productId: string; buyerId?: string | null; record: LicenseRecord; seats?: number | null; grantedAt: ISODate; expiresAt?: ISODate | null }

// ---------- Payments & subscriptions ----------
export interface CheckoutInput { orderId?: string; cart?: boolean; successUrl?: string; cancelUrl?: string; provider?: 'STRIPE' | 'MOCK' }
export interface CheckoutResult { provider: string; url?: string; sessionId: string; orderId: string; status: 'REQUIRES_ACTION' | 'PAID' }
export interface Subscription { id: string; userId: string; orgId?: string | null; tier: PlanTier; status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING' | 'INCOMPLETE'; priceCents: Cents; currency: string; interval: 'MONTH' | 'YEAR'; currentPeriodStart: ISODate; currentPeriodEnd: ISODate; cancelAtPeriodEnd: boolean; provider: string; providerRef?: string | null }
export interface CreateSubscriptionInput { tier: PlanTier; interval?: 'MONTH' | 'YEAR'; orgId?: string; successUrl?: string; cancelUrl?: string; provider?: 'STRIPE' | 'MOCK' }
export interface CreateSubscriptionResult { subscription: Subscription; checkout?: { url: string; sessionId: string } | null }

// ---------- Analytics & recommendations ----------
export interface AnalyticsEventInput { name: string; timestamp?: ISODate; sessionId?: string; userId?: string; gameId?: string; worldId?: string; productId?: string; props?: Record<string, unknown> }
export interface AnalyticsIngestResult { accepted: number; rejected: number }
export interface AnalyticsQuery { from?: ISODate; to?: ISODate; granularity?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH'; metric?: string; segment?: string }
export interface TimeseriesPoint { t: ISODate; value: number }
export interface AnalyticsOverview { period: { from: ISODate; to: ISODate }; totals: Record<string, number>; series: Record<string, TimeseriesPoint[]>; breakdowns?: Record<string, { key: string; value: number }[]> }
export interface CreatorAnalytics extends AnalyticsOverview { products: { productId: string; name: string; views: number; sales: number; revenueCents: Cents; conversion: number }[] }
export interface GameAnalytics extends AnalyticsOverview { retention: { d1: number; d7: number; d30: number }; avgSessionS: number; peakConcurrent: number; heatmap?: { x: number; z: number; weight: number }[] }
export interface RecommendationQuery { limit?: number; context?: 'HOME' | 'PRODUCT' | 'CART' | 'LIBRARY' | 'PLAY'; category?: ProductCategory }
export interface Recommendation { product: ProductSummary; score: number; reasons: string[] }

// ---------- Search, notifications, moderation ----------
export interface SearchQuery extends PageQuery { q: string; category?: ProductCategory; genre?: Genre; engine?: EngineTarget; kind?: 'PRODUCT' | 'WORLD' | 'GAME' | 'CREATOR' | 'ASSET' | 'ALL' }
export interface SearchHit { kind: 'PRODUCT' | 'WORLD' | 'GAME' | 'CREATOR' | 'ASSET'; id: string; slug?: string; name: string; description?: string; thumbnailUrl?: string | null; score: number; highlight?: string; payload?: Record<string, unknown> }
export interface Notification { id: string; userId: string; type: string; title: string; body?: string | null; link?: string | null; read: boolean; createdAt: ISODate; data?: Record<string, unknown> }
export interface NotificationQuery extends PageQuery { unreadOnly?: boolean }
export type ModerationStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
export interface ModerationItem { id: string; refKind: 'ASSET' | 'PRODUCT' | 'WORLD' | 'GAME' | 'REVIEW' | 'USER' | 'NPC'; refId: string; stage: string; status: ModerationStatus; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; reason: string; reporterId?: string | null; assigneeId?: string | null; aiVerdict?: { label: string; confidence: number; notes?: string } | null; createdAt: ISODate; resolvedAt?: ISODate | null }
export interface ModerationQueueQuery extends PageQuery { status?: ModerationStatus; severity?: ModerationItem['severity']; refKind?: ModerationItem['refKind'] }
export interface ResolveModerationInput { resolution: 'APPROVED' | 'REJECTED' | 'ESCALATED'; notes?: string; action?: 'NONE' | 'DELIST' | 'BAN' | 'WARN' }
export interface ReportInput { refKind: ModerationItem['refKind']; refId: string; reason: string; details?: string }

// ---------- Cloud & developer ----------
export interface MatchmakeInput { gameId: string; mode?: string; region?: string; party?: string[]; skill?: number }
export interface MatchmakeResult { ticketId: string; status: 'SEARCHING' | 'MATCHED' | 'TIMEOUT'; session?: GameSession; estimatedWaitS?: number }
export interface GameServer { id: string; gameId?: string | null; region: string; status: 'STARTING' | 'READY' | 'FULL' | 'DRAINING' | 'STOPPED'; address: string; port: number; players: number; maxPlayers: number; version?: string | null; startedAt: ISODate }
export interface ServerQuery { gameId?: string; region?: string; status?: GameServer['status'] }
export interface LiveEvent { id: string; gameId?: string | null; worldId?: string | null; name: string; description?: string | null; type: 'SEASON' | 'TOURNAMENT' | 'DROP' | 'RAID' | 'CUSTOM'; startsAt: ISODate; endsAt: ISODate; status: 'SCHEDULED' | 'LIVE' | 'ENDED'; config?: Record<string, unknown>; participants: number }
export interface CreateLiveEventInput { name: string; type: LiveEvent['type']; startsAt: ISODate; endsAt: ISODate; gameId?: string; worldId?: string; description?: string; config?: Record<string, unknown> }
export interface LiveEventQuery extends PageQuery { gameId?: string; status?: LiveEvent['status'] }
export interface Webhook { id: string; url: string; events: string[]; secret?: string; active: boolean; description?: string | null; lastDeliveryAt?: ISODate | null; failureCount: number; createdAt: ISODate }
export interface CreateWebhookInput { url: string; events: string[]; description?: string; active?: boolean }
export interface Integration { id: string; provider: 'UNITY' | 'UNREAL' | 'GODOT' | 'WEB' | 'STRIPE' | 'FIREBASE' | 'DISCORD' | 'CUSTOM'; name: string; status: 'AVAILABLE' | 'CONNECTED' | 'ERROR'; version?: string | null; docsUrl?: string | null; config?: Record<string, unknown>; connectedAt?: ISODate | null }

// ---------- Health ----------
export interface Health { status: 'ok' | 'degraded' | 'down'; version: string; uptimeS: number; timestamp: ISODate; checks?: Record<string, { status: 'ok' | 'fail'; latencyMs?: number; message?: string }> }
export interface Readiness { ready: boolean; checks: Record<string, boolean> }

// ---------- Realtime ----------
export type RealtimeTopic = `world:${string}` | `session:${string}` | `creator:${string}` | `user:${string}` | (string & {});
export interface RealtimeMessage<P = unknown> { topic: string; type: string; payload: P; at?: ISODate }
export type RealtimeClientOp = { op: 'SUBSCRIBE'; topic: string } | { op: 'UNSUBSCRIBE'; topic: string } | { op: 'PING' } | { op: 'PUBLISH'; topic: string; type: string; payload: unknown };
