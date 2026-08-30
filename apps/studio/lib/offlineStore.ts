'use client';

import { createEmptyWorld, createSampleWorld, randomUuid, SAMPLE_OWNER_ID, type Genre, type WorldDocument } from '@sonic-gameworld/world-schema';
import type { World } from '@sonic-gameworld/gameworld-sdk';
import { documentToWorldMeta } from './offline';

const INDEX_KEY = 'gw_studio_offline_worlds';
const docKey = (id: string) => `gw_studio_offline_world_${id}`;

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full/unavailable — the demo still works for the current session.
  }
}

function readIndex(): string[] {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  safeSet(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

/** Ensures the offline demo has at least the flagship NEON_TOKYO_2099 sample world. */
function ensureSeeded(): void {
  const index = readIndex();
  if (index.length > 0) return;
  const sample = createSampleWorld('NEON_TOKYO_2099');
  safeSet(docKey(sample.id), JSON.stringify(sample));
  writeIndex([sample.id]);
}

export function saveOfflineDocument(doc: WorldDocument): void {
  safeSet(docKey(doc.id), JSON.stringify(doc));
  const index = readIndex();
  if (!index.includes(doc.id)) writeIndex([...index, doc.id]);
}

export function getOfflineDocument(id: string): WorldDocument | undefined {
  ensureSeeded();
  const raw = safeGet(docKey(id));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as WorldDocument;
  } catch {
    return undefined;
  }
}

export function listOfflineWorlds(): World[] {
  ensureSeeded();
  return readIndex()
    .map((id) => getOfflineDocument(id))
    .filter((d): d is WorldDocument => Boolean(d))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map(documentToWorldMeta);
}

export interface CreateOfflineWorldInput {
  name: string;
  description?: string;
  genre?: Genre[];
  sizeKm2?: number;
  maxPlayers?: number;
}

export function createOfflineWorld(input: CreateOfflineWorldInput): WorldDocument {
  const doc = createEmptyWorld({
    id: randomUuid(),
    ownerId: SAMPLE_OWNER_ID,
    name: input.name,
    description: input.description ?? '',
    genre: input.genre ?? ['CYBERPUNK'],
    sizeKm2: input.sizeKm2 ?? 4,
    maxPlayers: input.maxPlayers ?? 32,
  });
  saveOfflineDocument(doc);
  return doc;
}

export function getOrSeedDefaultOfflineWorld(): WorldDocument {
  ensureSeeded();
  const [firstId] = readIndex();
  return (firstId && getOfflineDocument(firstId)) || createSampleWorld('NEON_TOKYO_2099');
}
