import { HttpClient, type HttpConfig } from './http.js';
import { connectRealtime, type RealtimeHandle, type RealtimeOptions } from './realtime.js';
import type {
  AddCartItemInput, AddOrgMemberInput, AICommandInput, AICommandResult, AIExecutionListQuery, AIGenerateInput,
  AIGenerateResult, AIToolInfo, AIUsage, AnalyticsEventInput, AnalyticsIngestResult,
  AnalyticsOverview, ApiKeyCreated, Asset, AssetListQuery, AssetVariantInfo, AuthSession, Cart,
  CartItem, CreateApiKeyInput, CreateAssetInput, CreateAssetVersionInput, CreateGameInput, CreateLiveEventInput,
  CreateMissionInput, CreateNPCInput, CreateOrderInput, CreateOrderResult, CreateOrgInput, CreateProductInput,
  CreateProductVersionInput, CreateReviewInput, CreateRtsSessionInput, CreateSessionInput, CreateSnapshotInput, CreateSubscriptionInput,
  CreateSubscriptionResult, CreateWebhookInput, CreatorAnalytics, CreatorBalance, CreatorDashboard,
  CreatorPassport, CreatorPatch, CreatorReputation, DevLoginInput, EntityPatch, FeaturedResponse,
  FirebaseLoginInput, ForgeInput, ForgeResult, Game, GameAnalytics, GameListQuery, GamePatch, GameSave,
  GameServer, GameSession, Health, Integration, JoinSessionResult, LeaderboardEntry, LeaderboardQuery,
  LibraryItem, LibraryQuery, LicenseCheckInput, LicenseCheckResult, LiveEvent, LiveEventQuery, MarketplaceMap,
  MarketplaceSearchQuery, MatchmakeInput, MatchmakeResult, Mission, MissionListQuery, MissionPatch, NPC,
  NPCChatInput, NPCChatResult, NPCListQuery, NPCPatch, Notification, NotificationQuery, Order, OrderListQuery,
  Organization, OrgMember, Page, PageQuery, Payout, Product, ProductLicense, ProductPatch, ProductVersion,
  PublishAssetInput, PublishResult, PublishWorldInput, PutGameSaveInput, Readiness, Recommendation,
  RecommendationQuery, RefundInput, RequestPayoutInput, ReportInput, Review, RtsJoinInput, RtsReadyResult,
  RtsSessionInfo, RtsSessionResult, SearchHit, SearchQuery, UpdateRtsDifficultyInput,
  SearchResult, ServerQuery, Subscription,
  SubmitScoreInput, UploadUrlInput, UploadUrlResult, User, UserPatch, Webhook, WishlistItem, World,
  WorldDocument, WorldListQuery, WorldPatch, WorldSnapshot,
} from './types.js';

export interface GameWorldClientOptions {
  /** Base URL of the API, e.g. `https://api.sonicgameworld.dev` or `http://localhost:4000`. */
  baseUrl: string;
  /** Bearer JWT (from auth.dev/auth.firebase/auth.refresh, or a stored session). */
  token?: string;
  /** SDK/service API key (`gw_live_...`), sent as `x-api-key`. */
  apiKey?: string;
  /** Custom fetch implementation (defaults to the runtime global). */
  fetch?: HttpConfig['fetch'];
}

/** Typed fetch client for the Sonic GameWorld OS API (`/v1`, see docs/CONTRACTS.md §9). */
export class GameWorldClient {
  private readonly http: HttpClient;

  constructor(options: GameWorldClientOptions) {
    this.http = new HttpClient({ baseUrl: options.baseUrl, token: options.token, apiKey: options.apiKey, fetch: options.fetch });
  }

  /** Store a token obtained from `auth.dev`/`auth.firebase`/`auth.refresh` for subsequent calls. */
  setToken(token: string | undefined): void {
    this.http.setToken(token);
  }
  setApiKey(apiKey: string | undefined): void {
    this.http.setApiKey(apiKey);
  }
  get baseUrl(): string {
    return this.http.baseUrl;
  }

  /** Open a realtime `/ws` connection and subscribe to the given topics. */
  connectRealtime(topics: string[], onMessage: (msg: import('./types.js').RealtimeMessage) => void, options?: Partial<RealtimeOptions>): RealtimeHandle {
    return connectRealtime(topics, onMessage, { baseUrl: this.http.baseUrl, token: this.http.token, ...options });
  }

  readonly auth = {
    dev: (input: DevLoginInput) => this.http.post<AuthSession>('/v1/auth/dev', input, { unauthenticated: true }),
    firebase: (input: FirebaseLoginInput) => this.http.post<AuthSession>('/v1/auth/firebase', input, { unauthenticated: true }),
    refresh: (refreshToken: string) => this.http.post<AuthSession['tokens']>('/v1/auth/refresh', { refreshToken }, { unauthenticated: true }),
    me: () => this.http.get<User>('/v1/auth/me'),
    createApiKey: (input: CreateApiKeyInput) => this.http.post<ApiKeyCreated>('/v1/auth/api-keys', input),
    deleteApiKey: (id: string) => this.http.delete<void>(`/v1/auth/api-keys/${id}`),
  };

  readonly users = {
    get: (id: string) => this.http.get<User>(`/v1/users/${id}`),
    update: (id: string, patch: UserPatch) => this.http.patch<User>(`/v1/users/${id}`, patch),
  };

  readonly orgs = {
    create: (input: CreateOrgInput) => this.http.post<Organization>('/v1/orgs', input),
    get: (id: string) => this.http.get<Organization>(`/v1/orgs/${id}`),
    addMember: (orgId: string, input: AddOrgMemberInput) => this.http.post<OrgMember>(`/v1/orgs/${orgId}/members`, input),
    updateMember: (orgId: string, userId: string, patch: Partial<Pick<OrgMember, 'role'>>) =>
      this.http.patch<OrgMember>(`/v1/orgs/${orgId}/members/${userId}`, patch),
  };

  readonly creators = {
    get: (handle: string) => this.http.get<CreatorPassport>(`/v1/creators/${handle}`),
    updateMe: (patch: CreatorPatch) => this.http.patch<CreatorPassport['profile']>('/v1/creators/me', patch),
    dashboard: () => this.http.get<CreatorDashboard>('/v1/creators/me/dashboard'),
    reputation: () => this.http.get<CreatorReputation>('/v1/creators/me/reputation'),
    balance: () => this.http.get<CreatorBalance>('/v1/creators/me/balance'),
    requestPayout: (input?: RequestPayoutInput) => this.http.post<Payout>('/v1/creators/me/payouts', input ?? {}),
    listPayouts: (query?: PageQuery) => this.http.get<Page<Payout>>('/v1/creators/me/payouts', { query }),
  };

  readonly worlds = {
    create: (input: import('./types.js').CreateWorldInput) => this.http.post<World>('/v1/worlds', input),
    list: (query?: WorldListQuery) => this.http.get<Page<World>>('/v1/worlds', { query }),
    get: (id: string) => this.http.get<World>(`/v1/worlds/${id}`),
    update: (id: string, patch: WorldPatch) => this.http.patch<World>(`/v1/worlds/${id}`, patch),
    remove: (id: string) => this.http.delete<void>(`/v1/worlds/${id}`),
    getDocument: (id: string) => this.http.get<WorldDocument>(`/v1/worlds/${id}/document`),
    putDocument: (id: string, document: WorldDocument) => this.http.put<WorldDocument>(`/v1/worlds/${id}/document`, document),
    createSnapshot: (id: string, input?: CreateSnapshotInput) => this.http.post<WorldSnapshot>(`/v1/worlds/${id}/snapshots`, input ?? {}),
    listSnapshots: (id: string, query?: PageQuery) => this.http.get<Page<WorldSnapshot>>(`/v1/worlds/${id}/snapshots`, { query }),
    addEntity: (id: string, entity: import('./types.js').WorldEntityInput) => this.http.post<import('./types.js').WorldEntity>(`/v1/worlds/${id}/entities`, entity),
    updateEntity: (id: string, entityId: string, patch: EntityPatch) => this.http.patch<import('./types.js').WorldEntity>(`/v1/worlds/${id}/entities/${entityId}`, patch),
    removeEntity: (id: string, entityId: string) => this.http.delete<void>(`/v1/worlds/${id}/entities/${entityId}`),
    publish: (id: string, input?: PublishWorldInput) => this.http.post<PublishResult>(`/v1/worlds/${id}/publish`, input ?? {}),
    forge: (id: string, input: ForgeInput) => this.http.post<ForgeResult>(`/v1/worlds/${id}/forge`, input),
    semantic: (id: string) => this.http.get<{ text: string }>(`/v1/worlds/${id}/semantic`),
  };

  readonly games = {
    create: (input: CreateGameInput) => this.http.post<Game>('/v1/games', input),
    list: (query?: GameListQuery) => this.http.get<Page<Game>>('/v1/games', { query }),
    get: (id: string) => this.http.get<Game>(`/v1/games/${id}`),
    update: (id: string, patch: GamePatch) => this.http.patch<Game>(`/v1/games/${id}`, patch),
    publish: (id: string) => this.http.post<Game>(`/v1/games/${id}/publish`),
    createSession: (id: string, input?: CreateSessionInput) => this.http.post<GameSession>(`/v1/games/${id}/sessions`, input ?? {}),
    getSave: (id: string, playerId: string) => this.http.get<GameSave>(`/v1/games/${id}/saves/${playerId}`),
    putSave: (id: string, playerId: string, input: PutGameSaveInput) => this.http.put<GameSave>(`/v1/games/${id}/saves/${playerId}`, input),
    leaderboard: (id: string, query?: LeaderboardQuery) => this.http.get<LeaderboardEntry[]>(`/v1/games/${id}/leaderboard`, { query }),
    submitScore: (id: string, input: SubmitScoreInput) => this.http.post<LeaderboardEntry>(`/v1/games/${id}/leaderboard`, input),
    /** docs/RTS-CONTRACTS.md §5: creates an RTS lobby — a match seed + faction roster, the host
     * taking the first faction, every other faction defaulting to AI-controlled. */
    createRtsSession: (id: string, input?: CreateRtsSessionInput) => this.http.post<RtsSessionResult>(`/v1/games/${id}/rts/sessions`, input ?? {}),
  };

  readonly sessions = {
    join: (id: string) => this.http.post<JoinSessionResult>(`/v1/sessions/${id}/join`),
    end: (id: string) => this.http.post<GameSession>(`/v1/sessions/${id}/end`),
    get: (id: string) => this.http.get<GameSession>(`/v1/sessions/${id}`),
    /** Claims an open RTS faction (or the first open one, if `factionId` is omitted). */
    rtsJoin: (id: string, input?: RtsJoinInput) => this.http.post<RtsSessionResult>(`/v1/sessions/${id}/rts/join`, input ?? {}),
    /** Confirms this player is ready; `RTS_MATCH_START` fires once every human faction is. */
    rtsReady: (id: string) => this.http.post<RtsReadyResult>(`/v1/sessions/${id}/rts/ready`),
    getRts: (id: string) => this.http.get<RtsSessionInfo>(`/v1/sessions/${id}/rts`),
    /** Host-only, lobby-only: sets the difficulty applied to any AI-controlled faction once the
     * match starts (docs/RTS-CONTRACTS.md §9). */
    rtsSetDifficulty: (id: string, input: UpdateRtsDifficultyInput) => this.http.patch<RtsSessionResult>(`/v1/sessions/${id}/rts/difficulty`, input),
  };

  readonly assets = {
    uploadUrl: (input: UploadUrlInput) => this.http.post<UploadUrlResult>('/v1/assets/upload-url', input),
    create: (input: CreateAssetInput) => this.http.post<Asset>('/v1/assets', input),
    list: (query?: AssetListQuery) => this.http.get<Page<Asset>>('/v1/assets', { query }),
    get: (id: string) => this.http.get<Asset>(`/v1/assets/${id}`),
    passport: (id: string) => this.http.get<import('./types.js').AssetPassport>(`/v1/assets/${id}/passport`),
    addVersion: (id: string, input: CreateAssetVersionInput) => this.http.post<import('./types.js').AssetVersion>(`/v1/assets/${id}/versions`, input),
    publish: (id: string, input?: PublishAssetInput) => this.http.post<PublishResult>(`/v1/assets/${id}/publish`, input ?? {}),
    variants: (id: string) => this.http.get<AssetVariantInfo[]>(`/v1/assets/${id}/variants`),
  };

  readonly npcs = {
    create: (input: CreateNPCInput) => this.http.post<NPC>('/v1/npcs', input),
    list: (query?: NPCListQuery) => this.http.get<Page<NPC>>('/v1/npcs', { query }),
    get: (id: string) => this.http.get<NPC>(`/v1/npcs/${id}`),
    update: (id: string, patch: NPCPatch) => this.http.patch<NPC>(`/v1/npcs/${id}`, patch),
    chat: (id: string, input: NPCChatInput) => this.http.post<NPCChatResult>(`/v1/npcs/${id}/chat`, input),
    generate: (input: import('./types.js').GenerateNPCInput) => this.http.post<NPC[]>('/v1/npcs/generate', input),
  };

  readonly missions = {
    create: (input: CreateMissionInput) => this.http.post<Mission>('/v1/missions', input),
    list: (query?: MissionListQuery) => this.http.get<Page<Mission>>('/v1/missions', { query }),
    get: (id: string) => this.http.get<Mission>(`/v1/missions/${id}`),
    update: (id: string, patch: MissionPatch) => this.http.patch<Mission>(`/v1/missions/${id}`, patch),
    generate: (input: import('./types.js').GenerateMissionInput) => this.http.post<Mission[]>('/v1/missions/generate', input),
  };

  readonly ai = {
    command: (input: AICommandInput) => this.http.post<AICommandResult>('/v1/ai/command', input),
    generate: (input: AIGenerateInput) => this.http.post<AIGenerateResult>('/v1/ai/generate', input),
    tools: () => this.http.get<AIToolInfo[]>('/v1/ai/tools'),
    executions: (query?: AIExecutionListQuery) => this.http.get<Page<import('./types.js').ToolExecution>>('/v1/ai/executions', { query }),
    usage: () => this.http.get<AIUsage>('/v1/ai/usage'),
  };

  readonly marketplace = {
    search: (query?: MarketplaceSearchQuery) => this.http.get<SearchResult>('/v1/marketplace/search', { query }),
    map: () => this.http.get<MarketplaceMap>('/v1/marketplace/map'),
    featured: () => this.http.get<FeaturedResponse>('/v1/marketplace/featured'),
  };

  readonly products = {
    get: (slug: string) => this.http.get<Product>(`/v1/products/${slug}`),
    create: (input: CreateProductInput) => this.http.post<Product>('/v1/products', input),
    update: (id: string, patch: ProductPatch) => this.http.patch<Product>(`/v1/products/${id}`, patch),
    addVersion: (id: string, input: CreateProductVersionInput) => this.http.post<ProductVersion>(`/v1/products/${id}/versions`, input),
    addReview: (id: string, input: CreateReviewInput) => this.http.post<Review>(`/v1/products/${id}/reviews`, input),
    listReviews: (id: string, query?: PageQuery) => this.http.get<Page<Review>>(`/v1/products/${id}/reviews`, { query }),
  };

  readonly wishlist = {
    add: (productId: string) => this.http.post<WishlistItem>('/v1/wishlist', { productId }),
    list: (query?: PageQuery) => this.http.get<Page<WishlistItem>>('/v1/wishlist', { query }),
  };

  readonly cart = {
    get: () => this.http.get<Cart>('/v1/cart'),
    addItem: (input: AddCartItemInput) => this.http.post<CartItem>('/v1/cart/items', input),
    removeItem: (id: string) => this.http.delete<Cart>(`/v1/cart/items/${id}`),
  };

  readonly orders = {
    create: (input?: CreateOrderInput) => this.http.post<CreateOrderResult>('/v1/orders', input ?? {}),
    list: (query?: OrderListQuery) => this.http.get<Page<Order>>('/v1/orders', { query }),
    get: (id: string) => this.http.get<Order>(`/v1/orders/${id}`),
    refund: (id: string, input?: RefundInput) => this.http.post<Order>(`/v1/orders/${id}/refund`, input ?? {}),
  };

  readonly library = {
    list: (query?: LibraryQuery) => this.http.get<Page<LibraryItem>>('/v1/library', { query }),
  };

  readonly licenses = {
    get: (id: string) => this.http.get<ProductLicense>(`/v1/licenses/${id}`),
    check: (input: LicenseCheckInput) => this.http.post<LicenseCheckResult>('/v1/licenses/check', input),
    byProduct: (productId: string) => this.http.get<ProductLicense[]>(`/v1/licenses/product/${productId}`),
  };

  readonly payments = {
    checkout: (input: import('./types.js').CheckoutInput) => this.http.post<import('./types.js').CheckoutResult>('/v1/payments/checkout', input),
    /** Forwards a raw provider webhook payload; typically only called from server-side code. */
    webhook: (rawBody: unknown, headers?: Record<string, string>) => this.http.post<{ received: true }>('/v1/payments/webhook', rawBody, { headers }),
  };

  readonly subscriptions = {
    create: (input: CreateSubscriptionInput) => this.http.post<CreateSubscriptionResult>('/v1/subscriptions', input),
    me: () => this.http.get<Subscription>('/v1/subscriptions/me'),
    cancel: () => this.http.delete<void>('/v1/subscriptions/me'),
  };

  readonly analytics = {
    track: (events: AnalyticsEventInput[]) => this.http.post<AnalyticsIngestResult>('/v1/analytics/events', { events }),
    overview: (query?: import('./types.js').AnalyticsQuery) => this.http.get<AnalyticsOverview>('/v1/analytics', { query }),
    creator: (query?: import('./types.js').AnalyticsQuery) => this.http.get<CreatorAnalytics>('/v1/analytics/creator', { query }),
    game: (id: string, query?: import('./types.js').AnalyticsQuery) => this.http.get<GameAnalytics>(`/v1/analytics/game/${id}`, { query }),
  };

  readonly recommendations = {
    list: (query?: RecommendationQuery) => this.http.get<Recommendation[]>('/v1/recommendations', { query }),
    similar: (productId: string, query?: { limit?: number }) => this.http.get<Recommendation[]>(`/v1/recommendations/similar/${productId}`, { query }),
  };

  readonly search = {
    query: (query: SearchQuery) => this.http.get<Page<SearchHit>>('/v1/search', { query }),
  };

  readonly notifications = {
    list: (query?: NotificationQuery) => this.http.get<Page<Notification>>('/v1/notifications', { query }),
    markRead: (id: string) => this.http.post<Notification>(`/v1/notifications/${id}/read`),
  };

  readonly moderation = {
    queue: (query?: import('./types.js').ModerationQueueQuery) => this.http.get<Page<import('./types.js').ModerationItem>>('/v1/moderation/queue', { query }),
    resolve: (id: string, input: import('./types.js').ResolveModerationInput) => this.http.post<import('./types.js').ModerationItem>(`/v1/moderation/${id}/resolve`, input),
    report: (input: ReportInput) => this.http.post<import('./types.js').ModerationItem>('/v1/moderation/report', input),
  };

  readonly cloud = {
    matchmake: (input: MatchmakeInput) => this.http.post<MatchmakeResult>('/v1/cloud/matchmake', input),
    listServers: (query?: ServerQuery) => this.http.get<GameServer[]>('/v1/cloud/servers', { query }),
    createLiveEvent: (input: CreateLiveEventInput) => this.http.post<LiveEvent>('/v1/cloud/live-events', input),
    listLiveEvents: (query?: LiveEventQuery) => this.http.get<Page<LiveEvent>>('/v1/cloud/live-events', { query }),
  };

  readonly developer = {
    listWebhooks: () => this.http.get<Webhook[]>('/v1/developer/webhooks'),
    createWebhook: (input: CreateWebhookInput) => this.http.post<Webhook>('/v1/developer/webhooks', input),
    listIntegrations: () => this.http.get<Integration[]>('/v1/developer/integrations'),
  };

  readonly health = {
    check: () => this.http.get<Health>('/v1/health'),
    ready: () => this.http.get<Readiness>('/v1/ready'),
  };
}

/** Create a typed client for the Sonic GameWorld OS API. See docs/CONTRACTS.md §9. */
export function createClient(options: GameWorldClientOptions): GameWorldClient {
  return new GameWorldClient(options);
}
