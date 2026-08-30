import type { RealtimeHandle, RealtimeMessage, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client';

export interface WorldRealtimeCallbacks {
  onPatch: (patch: Partial<WorldDocument>) => void;
  onExecution?: (payload: unknown) => void;
}

/**
 * Subscribes to `world:<id>` and routes incoming messages to document merges (WORLD_UPDATED /
 * WORLD_SNAPSHOT_CREATED) or the AI execution feed (AI_TOOL_EXECUTED / AI_TOOL_DENIED). No-ops
 * (returns undefined) when the client is in offline demo mode.
 */
export function subscribeWorld(worldId: string, offline: boolean, cb: WorldRealtimeCallbacks): RealtimeHandle | undefined {
  if (offline) return undefined;
  const client = getClient();
  try {
    return client.connectRealtime([`world:${worldId}`], (msg: RealtimeMessage) => {
      switch (msg.type) {
        case 'WORLD_UPDATED':
        case 'WORLD_SNAPSHOT_CREATED':
          cb.onPatch(msg.payload as Partial<WorldDocument>);
          break;
        case 'AI_TOOL_EXECUTED':
        case 'AI_TOOL_DENIED':
          cb.onExecution?.(msg.payload);
          break;
        default:
          break;
      }
    });
  } catch {
    return undefined;
  }
}
