import type { ProductPatch, ProductSummary } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

/** Real: `GET /v1/marketplace/search` used as an admin-wide product browse (no dedicated admin list route exists). */
export async function fetchAdminProducts(): Promise<ProductSummary[]> {
  const result = await getClient().marketplace.search({ limit: 50, sort: 'NEWEST' });
  return result.items;
}

/** Real: `PATCH /v1/products/:id`. Used for both delist/relist and feature/unfeature. */
export async function updateProduct(id: string, patch: ProductPatch) {
  return getClient().products.update(id, patch);
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

const creator = (id: string, handle: string, displayName: string, verified = true) => ({ id, handle, displayName, avatarUrl: null, verified });

export const DEMO_PRODUCTS: ProductSummary[] = [
  { id: 'prod_88ab3d4e', slug: 'cyberpunk-alley-kit', name: 'Cyberpunk Alley Kit', category: 'ENVIRONMENT', genre: ['CYBERPUNK'], engines: ['UNITY', 'WEB'], priceCents: 3900, currency: 'USD', thumbnailUrl: null, rating: 4.6, ratingCount: 128, sales: 940, creator: creator('user_1002', 'devonreyes', 'Devon Reyes'), licenseSummary: { commercial: true, multiplayer: true, attribution: false }, status: 'PUBLISHED', featured: true, publishedAt: daysAgo(120) },
  { id: 'prod_44cc7712', slug: 'vault-heist-chapter-one', name: 'Vault Heist: Chapter One', category: 'MISSION', genre: ['SHOOTER'], engines: ['UNREAL'], priceCents: 1499, currency: 'USD', thumbnailUrl: null, rating: 4.1, ratingCount: 52, sales: 310, creator: creator('user_1007', 'jasperlund', 'Jasper Lund'), licenseSummary: { commercial: true, multiplayer: false, attribution: true }, status: 'PENDING_REVIEW', featured: false, publishedAt: null },
  { id: 'prod_11f2aa90', slug: 'ancient-ruins-environment-pack', name: 'Ancient Ruins Environment Pack', category: 'ENVIRONMENT', genre: ['FANTASY', 'RPG'], engines: ['UNITY', 'UNREAL', 'WEB'], priceCents: 5900, currency: 'USD', thumbnailUrl: null, rating: 4.8, ratingCount: 301, sales: 2100, creator: creator('user_1003', 'mirao', 'Mira Okafor'), licenseSummary: { commercial: true, multiplayer: true, attribution: false }, status: 'PUBLISHED', featured: true, publishedAt: daysAgo(200) },
  { id: 'prod_ff2091ab', slug: 'skyline-racer-season-2', name: 'Skyline Racer: Season 2', category: 'GAME_KIT', genre: ['RACING'], engines: ['WEB'], priceCents: 2900, currency: 'USD', thumbnailUrl: null, rating: 4.3, ratingCount: 87, sales: 560, creator: creator('user_1008', 'yukit', 'Yuki Tanaka'), licenseSummary: { commercial: true, multiplayer: true, attribution: false }, status: 'PUBLISHED', featured: false, publishedAt: daysAgo(60) },
  { id: 'prod_00aa1122', slug: 'companion-npc-zayne', name: 'Companion NPC "Zayne"', category: 'AI_AGENT', genre: ['SCIFI'], engines: ['UNITY'], priceCents: 1900, currency: 'USD', thumbnailUrl: null, rating: 3.9, ratingCount: 22, sales: 140, creator: creator('user_1005', 'noahb', 'Noah Blackwood'), licenseSummary: { commercial: true, multiplayer: false, attribution: true }, status: 'PENDING_REVIEW', featured: false, publishedAt: null },
  { id: 'prod_9911bbcc', slug: 'retro-arcade-cabinet-pack', name: 'Retro Arcade Cabinet Pack', category: 'SYSTEM', genre: ['OTHER'], engines: ['UNITY', 'WEB'], priceCents: 990, currency: 'USD', thumbnailUrl: null, rating: 4.4, ratingCount: 63, sales: 420, creator: creator('user_1010', 'sofiam', 'Sofia Marchetti'), licenseSummary: { commercial: true, multiplayer: false, attribution: false }, status: 'DELISTED', featured: false, publishedAt: daysAgo(90) },
  { id: 'prod_7712aabb', slug: 'dynamic-foliage-system', name: 'Dynamic Foliage System', category: 'SYSTEM', genre: ['OTHER'], engines: ['UNITY', 'UNREAL'], priceCents: 4900, currency: 'USD', thumbnailUrl: null, rating: 4.7, ratingCount: 210, sales: 1500, creator: creator('user_1012', 'lenah', 'Lena Hartwig'), licenseSummary: { commercial: true, multiplayer: true, attribution: false }, status: 'PUBLISHED', featured: true, publishedAt: daysAgo(150) },
  { id: 'prod_2200ffaa', slug: 'frontier-outpost-alpha', name: 'Frontier Outpost Alpha', category: 'WORLD', genre: ['SURVIVAL', 'OPEN_WORLD'], engines: ['WEB'], priceCents: 0, currency: 'USD', thumbnailUrl: null, rating: 3.2, ratingCount: 18, sales: 900, creator: creator('user_1011', 'benoduya', 'Ben Oduya', false), licenseSummary: { commercial: false, multiplayer: true, attribution: true }, status: 'PUBLISHED', featured: false, publishedAt: daysAgo(30) },
];
