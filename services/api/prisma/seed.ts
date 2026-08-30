/**
 * Prisma seed script for Sonic GameWorld OS.
 *
 * Creates a small but representative dataset spanning every domain in docs/CONTRACTS.md §10:
 * 3 users (one platform_admin), 2 orgs, creator profiles/passports, the NEON_TOKYO_2099 sample
 * world (from @sonic-gameworld/world-schema), 12 marketplace products across all 10 categories
 * (with license + version rows), an "Extraction Shooter Starter" game kit, the 3 sample NPC
 * agents, 4 missions, and sample orders/royalties/reviews.
 *
 * Run with: pnpm --filter @sonic-gameworld/api prisma:seed  (or `tsx prisma/seed.ts`)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  createSampleWorld,
  NEON_TOKYO_NPCS,
  createNeonTokyoMissions,
  createNeonTokyoCameras,
  LICENSE_PRESETS,
  SAMPLE_WORLD_IDS,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type Genre,
  type EngineTarget,
} from '@sonic-gameworld/world-schema';

const prisma = new PrismaClient();

function cents(usd: number): number {
  return Math.round(usd * 100);
}

async function main() {
  console.log('Seeding Sonic GameWorld OS…');

  // ---------------------------------------------------------------------
  // Identity: 3 users (one platform_admin), 2 orgs
  // ---------------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sonicgameworld.dev' },
    update: {},
    create: {
      email: 'admin@sonicgameworld.dev',
      handle: 'gw_admin',
      displayName: 'GameWorld Admin',
      tier: 'ENTERPRISE',
      roles: ['platform_admin', 'admin'],
      emailVerified: true,
    },
  });

  const morganCreator = await prisma.user.upsert({
    where: { email: 'nova@sonicgameworld.dev' },
    update: {},
    create: {
      email: 'nova@sonicgameworld.dev',
      handle: 'nova_forge',
      displayName: 'Nova Forge',
      tier: 'STUDIO',
      roles: ['owner', 'editor'],
      emailVerified: true,
    },
  });

  const player = await prisma.user.upsert({
    where: { email: 'player1@sonicgameworld.dev' },
    update: {},
    create: {
      email: 'player1@sonicgameworld.dev',
      handle: 'kai_runner',
      displayName: 'Kai Runner',
      tier: 'CREATOR',
      roles: ['player', 'viewer'],
      emailVerified: true,
    },
  });

  const orgNova = await prisma.organization.upsert({
    where: { slug: 'nova-forge-studios' },
    update: {},
    create: { name: 'Nova Forge Studios', slug: 'nova-forge-studios', tier: 'STUDIO', ownerId: morganCreator.id },
  });
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: orgNova.id, userId: morganCreator.id } },
    update: {},
    create: { orgId: orgNova.id, userId: morganCreator.id, role: 'owner' },
  });

  const orgPlatform = await prisma.organization.upsert({
    where: { slug: 'sonic-gameworld-platform' },
    update: {},
    create: { name: 'Sonic GameWorld Platform', slug: 'sonic-gameworld-platform', tier: 'ENTERPRISE', ownerId: admin.id },
  });
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: orgPlatform.id, userId: admin.id } },
    update: {},
    create: { orgId: orgPlatform.id, userId: admin.id, role: 'owner' },
  });

  await prisma.user.update({ where: { id: morganCreator.id }, data: { orgId: orgNova.id } });
  await prisma.user.update({ where: { id: admin.id }, data: { orgId: orgPlatform.id } });

  // ---------------------------------------------------------------------
  // Creator profile / passport
  // ---------------------------------------------------------------------
  const creator = await prisma.creatorProfile.upsert({
    where: { userId: morganCreator.id },
    update: {},
    create: {
      userId: morganCreator.id,
      handle: 'nova_forge',
      displayName: 'Nova Forge',
      bio: 'Cyberpunk world-builder and AI-agent designer. Creator of Neon Tokyo 2099.',
      verified: true,
      followers: 4820,
      repScore: 87,
      repQuality: 92,
      repReliability: 88,
      repSales: 81,
      repUpdates: 90,
      repReviews: 86,
      repSupport: 84,
      repOriginality: 95,
      repCompliance: 100,
    },
  });

  // ---------------------------------------------------------------------
  // Worlds: NEON_TOKYO_2099 sample world
  // ---------------------------------------------------------------------
  const worldDoc = createSampleWorld('NEON_TOKYO_2099', { ownerId: morganCreator.id, now: new Date() });

  const world = await prisma.world.upsert({
    where: { id: SAMPLE_WORLD_IDS.NEON_TOKYO_2099 },
    update: {},
    create: {
      id: SAMPLE_WORLD_IDS.NEON_TOKYO_2099,
      ownerId: morganCreator.id,
      orgId: orgNova.id,
      name: worldDoc.name,
      slug: 'neon-tokyo-2099',
      description: worldDoc.description,
      genre: worldDoc.genre as Genre[],
      status: 'PUBLISHED',
      sizeKm2: worldDoc.sizeKm2,
      maxPlayers: worldDoc.maxPlayers,
      entityCount: worldDoc.entities.length,
      publishedAt: new Date(),
    },
  });

  const worldVersion = await prisma.worldVersion.upsert({
    where: { worldId_version: { worldId: world.id, version: '1.0.0' } },
    update: {},
    create: {
      worldId: world.id,
      version: '1.0.0',
      document: worldDoc as unknown as Prisma.InputJsonValue,
      createdBy: morganCreator.id,
    },
  });
  await prisma.world.update({ where: { id: world.id }, data: { currentVersionId: worldVersion.id } });

  await prisma.worldSnapshot.create({
    data: {
      worldId: world.id,
      versionId: worldVersion.id,
      label: 'Launch snapshot',
      createdBy: morganCreator.id,
      entityCount: worldDoc.entities.length,
      sizeBytes: Buffer.byteLength(JSON.stringify(worldDoc)),
    },
  });

  // ---------------------------------------------------------------------
  // NPCs: the 3 sample agents from world-schema
  // ---------------------------------------------------------------------
  const npcRows = await Promise.all(
    NEON_TOKYO_NPCS.map((def) =>
      prisma.nPC.upsert({
        where: { id: def.id },
        update: {},
        create: {
          id: def.id,
          worldId: world.id,
          ownerId: morganCreator.id,
          name: def.name,
          definition: def as unknown as Prisma.InputJsonValue,
          agentId: `agent_${def.name.toLowerCase().replace(/\s+/g, '_')}`,
          status: 'ACTIVE',
        },
      }),
    ),
  );
  const [detectiveMorgan] = npcRows;

  // ---------------------------------------------------------------------
  // Missions: the 3 sample missions + 1 extra ("Extraction: Cortex Chip Run")
  // ---------------------------------------------------------------------
  const sampleMissions = createNeonTokyoMissions();
  const extraMission = {
    id: 'mission_neon_extraction_01',
    name: 'Extraction: Cortex Chip Run',
    description: 'Infiltrate the syndicate stash house, extract the prototype cortex chip and reach the rooftop LZ before the timer runs out.',
    order: 4,
    difficulty: 7,
    state: 'DRAFT' as const,
    objectives: [
      { id: 'obj_4_1', type: 'REACH' as const, description: 'Reach the stash house', conditions: [] },
      { id: 'obj_4_2', type: 'COLLECT' as const, count: 1, description: 'Secure the prototype cortex chip', conditions: [] },
      { id: 'obj_4_3', type: 'SURVIVE' as const, timeLimitS: 180, description: 'Hold out for extraction', conditions: [] },
    ],
    triggers: [
      { id: 'trg_4_extract', kind: 'TIMER' as const, params: { durationS: 180 }, actions: [{ tool: 'set_weather' as const, args: { weather: 'FOG', intensity: 0.6 } }] },
    ],
    rewards: [{ type: 'CURRENCY' as const, amount: 2000 }, { type: 'XP' as const, amount: 900 }],
  };
  const allMissions = [...sampleMissions, extraMission];

  const missionRows = await Promise.all(
    allMissions.map((def) =>
      prisma.mission.upsert({
        where: { id: def.id },
        update: {},
        create: {
          id: def.id,
          worldId: world.id,
          ownerId: morganCreator.id,
          name: def.name,
          definition: def as unknown as Prisma.InputJsonValue,
          status: def.state === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
        },
      }),
    ),
  );

  // ---------------------------------------------------------------------
  // Games: "Extraction Shooter Starter" game kit
  // ---------------------------------------------------------------------
  const extractionGame = await prisma.game.upsert({
    where: { slug: 'extraction-shooter-starter' },
    update: {},
    create: {
      worldId: world.id,
      ownerId: morganCreator.id,
      orgId: orgNova.id,
      name: 'Extraction Shooter Starter',
      slug: 'extraction-shooter-starter',
      description: 'A ready-to-fork extraction shooter game kit built on Neon Tokyo 2099: loadouts, extraction timers, AI-driven NPC factions and a boss arena.',
      genre: ['SHOOTER', 'CYBERPUNK', 'TACTICAL'] as Genre[],
      engines: ['WEB', 'UNITY', 'UNREAL'] as EngineTarget[],
      status: 'PUBLISHED',
      maxPlayers: 16,
      modes: ['EXTRACTION', 'DEATHMATCH'],
      playerCount: 1240,
      rating: 4.6,
      publishedAt: new Date(),
    },
  });
  await prisma.gameVersion.upsert({
    where: { gameId_version: { gameId: extractionGame.id, version: '1.0.0' } },
    update: {},
    create: { gameId: extractionGame.id, version: '1.0.0', changelog: 'Initial release.' },
  });

  // ---------------------------------------------------------------------
  // Assets backing the marketplace products below
  // ---------------------------------------------------------------------
  async function makeAsset(slug: string, name: string, type: Parameters<typeof prisma.asset.create>[0]['data']['type']) {
    return prisma.asset.upsert({
      where: { slug },
      update: {},
      create: {
        creatorId: morganCreator.id,
        orgId: orgNova.id,
        name,
        slug,
        type,
        status: 'PUBLISHED',
        description: `${name} — production asset backing the marketplace listing.`,
        tags: ['neon-tokyo', 'cyberpunk'],
        sizeBytes: 42_000_000,
        polyCount: 128_000,
        qualityScore: 0.91,
      },
    });
  }

  const worldAsset = await makeAsset('asset-neon-tokyo-2099', 'Neon Tokyo 2099 World', 'OTHER');
  const gameKitAsset = await makeAsset('asset-extraction-shooter-kit', 'Extraction Shooter Starter Kit', 'OTHER');
  const combatSystemAsset = await makeAsset('asset-combat-ai-system', 'Faction Combat AI System', 'OTHER');
  const detectiveAgentAsset = await makeAsset('asset-detective-morgan-agent', 'Detective Morgan AI Agent', 'OTHER');
  const gangLeaderAgentAsset = await makeAsset('asset-gang-leader-agent', 'Cyberpunk Gang Leader AI Agent', 'OTHER');
  const merchantAgentAsset = await makeAsset('asset-fantasy-merchant-agent', 'Fantasy Merchant AI Agent', 'OTHER');
  const detectiveCharAsset = await makeAsset('asset-char-detective-morgan', 'Detective Morgan Character', 'MODEL');
  const gangLeaderCharAsset = await makeAsset('asset-char-gang-leader', 'Kuro-Neko Boss Character', 'MODEL');
  const droneVehicleAsset = await makeAsset('asset-veh-extraction-drone', 'Extraction Drone Vehicle', 'MODEL');
  const skylineEnvAsset = await makeAsset('asset-env-skyline-towers', 'Skyline Towers Environment Pack', 'OTHER');
  const bossCinematicAsset = await makeAsset('asset-cinematic-boss-reveal', 'Boss Reveal Cinematic Sequence', 'ANIMATION');
  const extractionMissionAsset = await makeAsset('asset-mission-cortex-run', 'Extraction: Cortex Chip Run Mission Pack', 'OTHER');

  for (const asset of [
    worldAsset, gameKitAsset, combatSystemAsset, detectiveAgentAsset, gangLeaderAgentAsset, merchantAgentAsset,
    detectiveCharAsset, gangLeaderCharAsset, droneVehicleAsset, skylineEnvAsset, bossCinematicAsset, extractionMissionAsset,
  ]) {
    await prisma.assetPassport.upsert({
      where: { assetId: asset.id },
      update: {},
      create: {
        assetId: asset.id,
        data: {
          assetId: asset.id,
          creatorId: morganCreator.id,
          createdAt: new Date().toISOString(),
          version: '1.0.0',
          source: 'ORIGINAL',
          license: LICENSE_PRESETS.STANDARD(`lic_${asset.slug}`),
          dependencies: [],
          modificationHistory: [],
          aiGenerated: false,
          aiAssisted: true,
          thirdPartyContent: false,
          marketplaceHistory: [{ productId: asset.slug, at: new Date().toISOString(), event: 'LISTED' }],
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Marketplace: 12 products across all 10 categories
  // ---------------------------------------------------------------------
  type ProductSeed = {
    slug: string;
    name: string;
    category: ProductCategory;
    genre: Genre[];
    engines: EngineTarget[];
    priceUsd: number;
    description: string;
    refId: string;
    license: ReturnType<typeof LICENSE_PRESETS.STANDARD>;
    featured?: boolean;
  };

  const productSeeds: ProductSeed[] = [
    {
      slug: 'neon-tokyo-2099', name: 'Neon Tokyo 2099', category: 'WORLD',
      genre: ['CYBERPUNK', 'OPEN_WORLD', 'SHOOTER'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 49, description: 'A rain-soaked cyberpunk district: neon towers, syndicate strongholds, a night market and an AI detective questline.',
      refId: worldAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_neon_tokyo'), featured: true,
    },
    {
      slug: 'extraction-shooter-starter', name: 'Extraction Shooter Starter', category: 'GAME_KIT',
      genre: ['SHOOTER', 'TACTICAL', 'CYBERPUNK'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 79, description: 'Full extraction-shooter game kit: loadouts, timers, factions and a boss arena, ready to fork.',
      refId: gameKitAsset.id, license: LICENSE_PRESETS.ENTERPRISE('lic_prod_extraction_kit'), featured: true,
    },
    {
      slug: 'faction-combat-ai-system', name: 'Faction Combat AI System', category: 'SYSTEM',
      genre: ['TACTICAL', 'SHOOTER'], engines: ['WEB', 'UNITY', 'UNREAL', 'GODOT'],
      priceUsd: 39, description: 'Reusable behavior-tree system driving patrol, combat and retreat states across factions.',
      refId: combatSystemAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_combat_system'),
    },
    {
      slug: 'detective-morgan-agent', name: 'Detective Morgan AI Agent', category: 'AI_AGENT',
      genre: ['CYBERPUNK', 'MMO'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 15, description: 'Noir detective NPC agent with memory, quest logic and voice-ready dialogue.',
      refId: detectiveAgentAsset.id, license: LICENSE_PRESETS.CC_BY('lic_prod_morgan_agent'),
    },
    {
      slug: 'gang-leader-agent', name: 'Cyberpunk Gang Leader AI Agent', category: 'AI_AGENT',
      genre: ['CYBERPUNK'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 15, description: 'Boss-arena AI agent with taunt/combat/enrage states and villain dialogue.',
      refId: gangLeaderAgentAsset.id, license: LICENSE_PRESETS.CC_BY('lic_prod_gangleader_agent'),
    },
    {
      slug: 'fantasy-merchant-agent', name: 'Fantasy Merchant AI Agent', category: 'AI_AGENT',
      genre: ['FANTASY', 'RPG'], engines: ['WEB', 'UNITY', 'UNREAL', 'GODOT'],
      priceUsd: 12, description: 'Neutral merchant NPC agent with trade logic, rumor system and warm dialogue.',
      refId: merchantAgentAsset.id, license: LICENSE_PRESETS.CC0('lic_prod_merchant_agent'),
    },
    {
      slug: 'detective-morgan-character', name: 'Detective Morgan Character', category: 'CHARACTER',
      genre: ['CYBERPUNK'], engines: ['UNITY', 'UNREAL', 'WEB'],
      priceUsd: 25, description: 'Rigged, LOD-optimized character model for Detective Morgan with 6 outfit variants.',
      refId: detectiveCharAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_morgan_char'),
    },
    {
      slug: 'extraction-drone-vehicle', name: 'Extraction Drone Vehicle', category: 'VEHICLE',
      genre: ['CYBERPUNK', 'SHOOTER'], engines: ['UNITY', 'UNREAL', 'WEB'],
      priceUsd: 22, description: 'Player-summonable extraction drone with flight physics and LZ homing behavior.',
      refId: droneVehicleAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_drone'),
    },
    {
      slug: 'skyline-towers-environment', name: 'Skyline Towers Environment Pack', category: 'ENVIRONMENT',
      genre: ['CYBERPUNK', 'OPEN_WORLD'], engines: ['UNITY', 'UNREAL', 'WEB'],
      priceUsd: 34, description: 'Modular corporate skyline towers, rooftops and skybridges with PBR materials.',
      refId: skylineEnvAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_skyline'),
    },
    {
      slug: 'boss-reveal-cinematic', name: 'Boss Reveal Cinematic Sequence', category: 'CINEMATIC',
      genre: ['CYBERPUNK'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 18, description: 'Crane + drone camera sequence for dramatic boss reveals, with color grading preset.',
      refId: bossCinematicAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_boss_cinematic'),
    },
    {
      slug: 'extraction-cortex-run-mission', name: 'Extraction: Cortex Chip Run', category: 'MISSION',
      genre: ['SHOOTER', 'CYBERPUNK', 'TACTICAL'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 9, description: 'Drop-in timed extraction mission pack with objectives, triggers and rewards.',
      refId: extractionMissionAsset.id, license: LICENSE_PRESETS.STANDARD('lic_prod_cortex_mission'),
    },
    {
      slug: 'neon-tokyo-full-experience', name: 'Neon Tokyo 2099: Full Experience Bundle', category: 'EXPERIENCE',
      genre: ['CYBERPUNK', 'OPEN_WORLD', 'SHOOTER', 'RPG'], engines: ['WEB', 'UNITY', 'UNREAL'],
      priceUsd: 129, description: 'The complete Neon Tokyo 2099 bundle: world, game kit, all 3 AI agents and the mission chain.',
      refId: worldAsset.id, license: LICENSE_PRESETS.ENTERPRISE('lic_prod_full_experience'), featured: true,
    },
  ];

  const products = [];
  for (const seed of productSeeds) {
    const product = await prisma.product.upsert({
      where: { slug: seed.slug },
      update: {},
      create: {
        slug: seed.slug,
        name: seed.name,
        category: seed.category,
        genre: seed.genre,
        engines: seed.engines,
        priceCents: cents(seed.priceUsd),
        description: seed.description,
        longDescription: `${seed.description} Part of the Neon Tokyo 2099 launch catalog by Nova Forge Studios.`,
        tags: ['neon-tokyo-2099', seed.category.toLowerCase()],
        previewUrls: [`https://cdn.sonicgameworld.dev/previews/${seed.slug}/thumb.jpg`],
        thumbnailUrl: `https://cdn.sonicgameworld.dev/previews/${seed.slug}/thumb.jpg`,
        license: seed.license as unknown as Prisma.InputJsonValue,
        refKind: seed.category === 'WORLD' || seed.category === 'EXPERIENCE' ? 'WORLD'
          : seed.category === 'GAME_KIT' ? 'GAME'
          : seed.category === 'AI_AGENT' ? 'NPC'
          : seed.category === 'MISSION' ? 'MISSION'
          : 'ASSET',
        creatorId: creator.id,
        status: 'PUBLISHED',
        featured: seed.featured ?? false,
        rating: 4.2 + Math.random() * 0.7,
        ratingCount: 10 + Math.floor(Math.random() * 200),
        sales: 5 + Math.floor(Math.random() * 500),
        publishedAt: new Date(),
      },
    });
    await prisma.productVersion.upsert({
      where: { productId_version: { productId: product.id, version: '1.0.0' } },
      update: {},
      create: { productId: product.id, version: '1.0.0', changelog: 'Initial release.' },
    });
    products.push(product);
  }

  // Sanity check: every category from the taxonomy is represented at least once.
  const seededCategories = new Set(productSeeds.map((p) => p.category));
  for (const category of PRODUCT_CATEGORIES) {
    if (!seededCategories.has(category)) {
      throw new Error(`Seed data is missing a product for category ${category}`);
    }
  }

  // ---------------------------------------------------------------------
  // Sample orders, royalties and reviews
  // ---------------------------------------------------------------------
  const worldProduct = products.find((p) => p.slug === 'neon-tokyo-2099')!;
  const kitProduct = products.find((p) => p.slug === 'extraction-shooter-starter')!;
  const morganAgentProduct = products.find((p) => p.slug === 'detective-morgan-agent')!;

  const orderItemsSeed = [
    { product: worldProduct, quantity: 1 },
    { product: kitProduct, quantity: 1 },
  ];
  const subtotal = orderItemsSeed.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0);
  const feeCents = Math.round(subtotal * 0.15); // CREATOR tier default fee (§4)

  const order = await prisma.order.create({
    data: {
      buyerId: player.id,
      status: 'PAID',
      subtotalCents: subtotal,
      totalCents: subtotal,
      paymentProvider: 'MOCK',
      paymentRef: 'mock_pi_seed_0001',
      paidAt: new Date(),
      items: {
        create: orderItemsSeed.map(({ product, quantity }) => {
          const itemFee = Math.round(product.priceCents * quantity * 0.15);
          return {
            productId: product.id,
            quantity,
            unitPriceCents: product.priceCents,
            feeCents: itemFee,
            royaltyCents: product.priceCents * quantity - itemFee,
          };
        }),
      },
    },
    include: { items: true },
  });

  for (const item of order.items) {
    await prisma.royaltyAccrual.create({
      data: {
        creatorId: creator.id,
        orderItemId: item.id,
        amountCents: item.royaltyCents,
        status: 'ACCRUED',
      },
    });
  }

  await prisma.productLicense.create({
    data: {
      productId: worldProduct.id,
      buyerId: player.id,
      record: LICENSE_PRESETS.STANDARD('lic_grant_neon_tokyo_player1') as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.payout.create({
    data: {
      creatorId: creator.id,
      amountCents: feeCents > 0 ? subtotal - feeCents : subtotal,
      status: 'SENT',
      provider: 'STRIPE_CONNECT',
      providerRef: 'po_seed_0001',
      sentAt: new Date(),
    },
  });

  await prisma.review.createMany({
    data: [
      {
        productId: worldProduct.id, authorId: player.id, rating: 5,
        title: 'Best cyberpunk world on the marketplace', body: 'The rain, the neon, the AI detective — incredible atmosphere and easy to extend.',
        verifiedPurchase: true, helpful: 42,
      },
      {
        productId: kitProduct.id, authorId: player.id, rating: 4,
        title: 'Great starting point', body: 'Saved us weeks of extraction-shooter boilerplate. Docs could be better.',
        verifiedPurchase: true, helpful: 17,
      },
      {
        productId: morganAgentProduct.id, authorId: player.id, rating: 5,
        title: 'Feels alive', body: 'Detective Morgan remembers our last conversation across sessions. Great NPC memory demo.',
        verifiedPurchase: false, helpful: 6,
      },
    ],
    skipDuplicates: true,
  });

  // ---------------------------------------------------------------------
  // A little supporting data: notification, moderation item, search docs
  // ---------------------------------------------------------------------
  await prisma.notification.create({
    data: {
      userId: creator.userId,
      type: 'SALE',
      title: 'You made a sale!',
      body: `${player.displayName} purchased ${worldProduct.name}.`,
      link: `/products/${worldProduct.slug}`,
    },
  });

  await prisma.moderationItem.create({
    data: {
      refKind: 'PRODUCT',
      refId: worldProduct.id,
      stage: 'AI_SAFETY',
      status: 'APPROVED',
      severity: 'LOW',
      reason: 'Automated content-policy scan on publish.',
      aiVerdictLabel: 'safe',
      aiVerdictConfidence: 0.98,
      resolvedAt: new Date(),
    },
  });

  for (const product of products) {
    await prisma.searchDocument.upsert({
      where: { kind_refId: { kind: 'PRODUCT', refId: product.id } },
      update: { text: `${product.name} ${product.category} ${product.description}` },
      create: { kind: 'PRODUCT', refId: product.id, text: `${product.name} ${product.category} ${product.description}` },
    });
  }

  console.log('Seed complete:', {
    users: 3,
    orgs: 2,
    world: world.slug,
    npcs: npcRows.length,
    missions: missionRows.length,
    games: 1,
    products: products.length,
    detectiveMorganId: detectiveMorgan!.id,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
