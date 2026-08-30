'use client';

import { randomUuid } from '@sonic-gameworld/world-schema';
import type { NPC, NPCChatResult, NPCDefinition } from '@sonic-gameworld/gameworld-sdk';
import { ensureSession, getClient } from './client';

/**
 * NPC records are their own top-level resource (CONTRACTS §9 `/v1/npcs`), not part of the
 * WorldDocument — so, like AI Director commands, they need an offline-friendly path when the API
 * is unreachable. This module mirrors the SDK's `client.npcs` surface against `localStorage`.
 */

const indexKey = (worldId: string) => `gw_studio_offline_npcs_${worldId}`;

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
    /* best-effort */
  }
}

function readOfflineNpcs(worldId: string): NPC[] {
  const raw = safeGet(indexKey(worldId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as NPC[];
  } catch {
    return [];
  }
}

function writeOfflineNpcs(worldId: string, npcs: NPC[]): void {
  safeSet(indexKey(worldId), JSON.stringify(npcs));
}

export async function listNpcs(worldId: string, offline: boolean): Promise<NPC[]> {
  if (!offline) {
    try {
      const online = await ensureSession();
      if (online) {
        const page = await getClient().npcs.list({ worldId });
        return page.items;
      }
    } catch {
      // fall through to offline
    }
  }
  return readOfflineNpcs(worldId);
}

export async function createNpc(worldId: string, definition: NPCDefinition, offline: boolean): Promise<NPC> {
  if (!offline) {
    try {
      const online = await ensureSession();
      if (online) return await getClient().npcs.create({ worldId, name: definition.name, definition });
    } catch {
      // fall through to offline
    }
  }
  const npc: NPC = {
    id: randomUuid(),
    worldId,
    ownerId: 'studio-demo',
    name: definition.name,
    definition,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeOfflineNpcs(worldId, [...readOfflineNpcs(worldId), npc]);
  return npc;
}

export async function updateNpc(worldId: string, id: string, patch: { name?: string; definition?: Partial<NPCDefinition>; status?: NPC['status'] }, offline: boolean): Promise<NPC | undefined> {
  if (!offline) {
    try {
      const online = await ensureSession();
      if (online) return await getClient().npcs.update(id, patch);
    } catch {
      // fall through to offline
    }
  }
  const npcs = readOfflineNpcs(worldId);
  let updated: NPC | undefined;
  const next = npcs.map((n) => {
    if (n.id !== id) return n;
    updated = {
      ...n,
      name: patch.name ?? n.name,
      status: patch.status ?? n.status,
      definition: patch.definition ? ({ ...n.definition, ...patch.definition } as NPCDefinition) : n.definition,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  writeOfflineNpcs(worldId, next);
  return updated;
}

export async function removeNpcOffline(worldId: string, id: string): Promise<void> {
  writeOfflineNpcs(worldId, readOfflineNpcs(worldId).filter((n) => n.id !== id));
}

const FALLBACK_LINES = ['I hear you.', "Let's see what we can do about that.", "Not sure that's my problem, but go on."];

export async function chatWithNpc(npc: NPC, message: string, offline: boolean): Promise<NPCChatResult> {
  if (!offline) {
    try {
      const online = await ensureSession();
      if (online) return await getClient().npcs.chat(npc.id, { message });
    } catch {
      // fall through to offline
    }
  }
  const { personality, dialogue } = npc.definition;
  const opener = dialogue.openingLines[Math.floor(Math.random() * Math.max(1, dialogue.openingLines.length))] ?? FALLBACK_LINES[0]!;
  const reply = message.trim()
    ? `[${personality.tone}] ${opener} (Re: "${message.slice(0, 60)}") — ${personality.traits.join(', ') || 'no strong opinions on that'}.`
    : opener;
  return { reply, actions: [], memoryWritten: npc.definition.memory.enabled, sessionId: `offline-${npc.id}` };
}
