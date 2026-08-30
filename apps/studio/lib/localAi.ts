import { randomUuid, transformAt, touchWorld, vec3, type CameraMode, type Weather } from '@sonic-gameworld/world-schema';
import type { AIAgentRole, AIToolName, ToolCall, WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';

export interface LocalToolExecution {
  id: string;
  tool: AIToolName;
  args: Record<string, unknown>;
  role: AIAgentRole;
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  events: string[];
  createdAt: string;
}

export interface LocalAIDenied {
  tool: AIToolName;
  args: Record<string, unknown>;
  reason: string;
  code: 'PERMISSION' | 'VALIDATION' | 'QUOTA' | 'LICENSE' | 'SAFETY';
}

export interface LocalAICommandResult {
  plan: { role: AIAgentRole; toolCalls: ToolCall[]; rationale?: string };
  executed: LocalToolExecution[];
  denied: LocalAIDenied[];
  narration: string;
  document: WorldDocument;
}

const WEATHER_WORDS: Record<string, Weather> = {
  storm: 'STORM',
  stormy: 'STORM',
  rain: 'RAIN',
  rainy: 'RAIN',
  snow: 'SNOW',
  snowy: 'SNOW',
  fog: 'FOG',
  foggy: 'FOG',
  sandstorm: 'SANDSTORM',
  clear: 'CLEAR',
  sunny: 'CLEAR',
  clouds: 'CLOUDS',
  cloudy: 'CLOUDS',
};

function newExec(tool: AIToolName, args: Record<string, unknown>, role: AIAgentRole, ok: boolean, result?: unknown, error?: string): LocalToolExecution {
  return {
    id: randomUuid(),
    tool,
    args,
    role,
    ok,
    result,
    error,
    durationMs: 40 + Math.round(Math.random() * 160),
    events: ok ? ['AI_TOOL_EXECUTED'] : ['AI_TOOL_DENIED'],
    createdAt: new Date().toISOString(),
  };
}

function findEntityByHint(doc: WorldDocument, hint: string): WorldEntity | undefined {
  const q = hint.trim().toLowerCase();
  if (!q) return undefined;
  return (
    doc.entities.find((e) => e.name.toLowerCase() === q) ??
    doc.entities.find((e) => e.name.toLowerCase().includes(q)) ??
    doc.entities.find((e) => q.includes(e.id.toLowerCase()))
  );
}

function findBuilding(doc: WorldDocument, hint?: string): WorldEntity | undefined {
  const buildings = doc.entities.filter((e) => e.kind === 'BUILDING');
  if (hint) {
    const named = buildings.find((b) => b.name.toLowerCase().includes(hint.toLowerCase()));
    if (named) return named;
  }
  return buildings[0];
}

/**
 * Deterministic, dependency-free stand-in for the server's `mock` AI provider (CONTRACTS §8) so
 * GameWorld Studio's AI Director bar works fully offline. Mirrors the pipeline shape
 * (AI -> Tool -> Validation -> Execution -> narration) without ever throwing.
 */
export function runLocalAICommand(text: string, doc: WorldDocument, opts: { selectedEntityId?: string; actor?: string } = {}): LocalAICommandResult {
  const role: AIAgentRole = 'DIRECTOR';
  const lower = text.toLowerCase();
  const toolCalls: ToolCall[] = [];
  const executed: LocalToolExecution[] = [];
  const denied: LocalAIDenied[] = [];
  let next = doc;
  const narrationParts: string[] = [];
  const actor = opts.actor ?? 'ai-director';

  const commit = (fn: (d: WorldDocument) => WorldDocument, note: string) => {
    next = touchWorld(fn(next), actor, note);
  };

  // --- publish attempts are explicitly denied from chat (permission lives in the Publish wizard) ---
  if (/\bpublish\b/.test(lower)) {
    const args = { worldId: doc.id };
    toolCalls.push({ tool: 'publish_asset', args });
    denied.push({ tool: 'publish_asset', args, code: 'PERMISSION', reason: 'AI Director cannot publish worlds directly — use the Publish wizard so a human confirms pricing and licensing.' });
    narrationParts.push("I can't publish this world from chat — head to the Publish wizard when you're ready.");
  }

  // --- follow / track entity ---
  const followMatch = lower.match(/\b(?:follow|track|chase)\b\s*(?:the\s+)?([a-z0-9 _-]+)?/);
  if (followMatch) {
    const hint = followMatch[1]?.trim() ?? '';
    const target = findEntityByHint(next, hint) ?? next.entities.find((e) => e.kind === 'PLAYER_SPAWN' || e.kind === 'NPC');
    const args = { entityId: target?.id, mode: 'FOLLOW' as CameraMode };
    toolCalls.push({ tool: 'track_entity', args });
    if (target) {
      executed.push(newExec('track_entity', args, role, true, { trackedEntityId: target.id, cameraMode: 'FOLLOW' }));
      narrationParts.push(`Camera is now following ${target.name}.`);
    } else {
      denied.push({ tool: 'track_entity', args, code: 'VALIDATION', reason: `No entity matching "${hint || 'that description'}" was found in this world.` });
      narrationParts.push(`I couldn't find "${hint || 'that target'}" to follow.`);
    }
  }

  // --- weather ---
  const weatherWord = Object.keys(WEATHER_WORDS).find((w) => lower.includes(w));
  if (weatherWord) {
    const weather = WEATHER_WORDS[weatherWord] as Weather;
    const intensity = /(heavy|start|intense)/.test(lower) ? 0.85 : 0.5;
    const args = { weather, intensity };
    toolCalls.push({ tool: 'set_weather', args });
    commit((d) => ({ ...d, environment: { ...d.environment, weather, weatherIntensity: intensity } }), `AI set weather to ${weather}`);
    executed.push(newExec('set_weather', args, role, true, { weather, intensity }));
    narrationParts.push(`Weather set to ${weather.toLowerCase()}${intensity > 0.7 ? ' at full intensity' : ''}.`);
  }

  // --- time of day ---
  const timeMatch = lower.match(/\b(?:set\s+)?time\s*(?:of day)?\s*(?:to)?\s*(\d{1,2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hh = Number(timeMatch[1]);
    const mm = timeMatch[2] ? Number(timeMatch[2]) : 0;
    const timeOfDay = Math.min(24, Math.max(0, hh + mm / 60));
    const args = { timeOfDay };
    toolCalls.push({ tool: 'set_time_of_day', args });
    commit((d) => ({ ...d, environment: { ...d.environment, timeOfDay } }), `AI set time of day to ${timeOfDay}`);
    executed.push(newExec('set_time_of_day', args, role, true, { timeOfDay }));
    narrationParts.push(`Time of day set to ${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}.`);
  } else if (/\bnight\b/.test(lower)) {
    const args = { timeOfDay: 21 };
    toolCalls.push({ tool: 'set_time_of_day', args });
    commit((d) => ({ ...d, environment: { ...d.environment, timeOfDay: 21 } }), 'AI set time of day to night');
    executed.push(newExec('set_time_of_day', args, role, true, { timeOfDay: 21 }));
    narrationParts.push('Switched to nighttime lighting.');
  } else if (/\bday(time)?\b/.test(lower) && !/\btoday\b/.test(lower)) {
    const args = { timeOfDay: 13 };
    toolCalls.push({ tool: 'set_time_of_day', args });
    commit((d) => ({ ...d, environment: { ...d.environment, timeOfDay: 13 } }), 'AI set time of day to day');
    executed.push(newExec('set_time_of_day', args, role, true, { timeOfDay: 13 }));
    narrationParts.push('Switched to daytime lighting.');
  }

  // --- spawn enemy squad / npc(s) ---
  const spawnMatch = lower.match(/\bspawn\b.*?(\d+)?\s*(enem(?:y|ies)|squad|npc|guard|drone)s?\b(?:.*?\b(?:behind|near|at|inside)\s+(?:the\s+)?([a-z0-9 _-]+))?/);
  if (spawnMatch) {
    const count = spawnMatch[1] ? Math.min(12, Math.max(1, Number(spawnMatch[1]))) : /squad/.test(lower) ? 4 : 1;
    const anchorHint = spawnMatch[3];
    const anchor = findBuilding(next, anchorHint) ?? next.entities.find((e) => e.kind === 'REGION');
    const base = anchor ? anchor.transform.position : vec3(0, 0, 0);
    const spawned: WorldEntity[] = Array.from({ length: count }, (_, i) => ({
      id: randomUuid(),
      kind: 'NPC',
      name: `AI Spawned Enemy ${i + 1}`,
      parentId: anchor?.id,
      transform: transformAt(base.x + (i - (count - 1) / 2) * 3, base.y, base.z - 6, 1),
      ai: { memoryEnabled: false },
      behavior: { params: { faction: 'hostile' } },
      tags: ['ai-spawned', 'enemy'],
      permissions: { ownerId: doc.passport.creatorId, editors: [], visibility: 'PRIVATE' },
      metadata: { spawnedByAI: true },
    }));
    const args = { count, anchorEntityId: anchor?.id, kind: 'NPC' as const, faction: 'hostile' };
    toolCalls.push({ tool: 'spawn_npc', args });
    commit((d) => ({ ...d, entities: [...d.entities, ...spawned] }), `AI spawned ${count} enemy NPC(s)`);
    executed.push(newExec('spawn_npc', args, role, true, { spawnedIds: spawned.map((s) => s.id) }));
    narrationParts.push(`Spawned ${count} ${count === 1 ? 'enemy' : 'enemies'}${anchor ? ` near ${anchor.name}` : ''}.`);
  }

  // --- cinematic shot ---
  if (/\bcinematic\b/.test(lower) || /\bshot of\b/.test(lower)) {
    const mode: CameraMode = /\bdrone\b|\baerial\b|\bfly ?over\b/.test(lower) ? 'DRONE' : 'CRANE';
    const rig = {
      id: randomUuid(),
      name: `AI Cinematic Rig ${next.cameras.length + 1}`,
      mode,
      keyframes: [
        { t: 0, transform: transformAt(0, 60, 80, 1), fov: 45 },
        { t: 6, transform: transformAt(40, 30, -20, 1), fov: 35 },
      ],
      params: { distance: 40, height: 60, damping: 0.15, fov: 45 },
    };
    const sequence = { id: randomUuid(), name: 'AI City Flyover', shots: [{ rigId: rig.id, durationS: 6, transition: 'FADE' as const }] };
    const args = { name: rig.name, mode };
    toolCalls.push({ tool: 'create_camera_rig', args });
    toolCalls.push({ tool: 'create_cinematic', args: { name: sequence.name, shots: sequence.shots.length } });
    commit((d) => ({ ...d, cameras: [...d.cameras, rig] }), `AI created cinematic rig ${rig.name}`);
    executed.push(newExec('create_camera_rig', args, role, true, { rigId: rig.id }));
    executed.push(newExec('create_cinematic', { name: sequence.name }, role, true, { sequenceId: sequence.id }));
    narrationParts.push(`Framed a ${mode === 'DRONE' ? 'drone flyover' : 'sweeping crane'} cinematic shot of the city.`);
  }

  // --- boss arena ---
  if (/\bboss arena\b/.test(lower) || (/\bboss\b/.test(lower) && /\barena\b/.test(lower))) {
    const target = opts.selectedEntityId ? next.entities.find((e) => e.id === opts.selectedEntityId) : next.entities.find((e) => e.kind === 'REGION' || e.kind === 'ZONE');
    const args = { entityId: target?.id, patch: { tags: ['boss-arena'], metadata: { bossArena: true } } };
    toolCalls.push({ tool: 'modify_entity', args });
    if (target) {
      commit(
        (d) => ({
          ...d,
          entities: d.entities.map((e) =>
            e.id === target.id
              ? { ...e, tags: Array.from(new Set([...e.tags, 'boss-arena'])), metadata: { ...e.metadata, bossArena: true }, behavior: { params: { ...(e.behavior?.params ?? {}), systemId: 'boss_encounter' }, systemId: 'boss_encounter' } }
              : e,
          ),
        }),
        `AI converted ${target.name} into a boss arena`,
      );
      executed.push(newExec('modify_entity', args, role, true, { entityId: target.id }));
      narrationParts.push(`${target.name} is now rigged as a boss arena.`);
    } else {
      denied.push({ tool: 'modify_entity', args, code: 'VALIDATION', reason: 'Select a region or zone first so I know which area to convert.' });
      narrationParts.push('Select an area in the scene tree first so I know where to build the boss arena.');
    }
  }

  if (toolCalls.length === 0) {
    denied.push({
      tool: 'query_world',
      args: { text },
      code: 'VALIDATION',
      reason: 'Could not match this to a supported AI Director action yet (try weather, time of day, spawning, camera follow, cinematics, or boss arenas).',
    });
    narrationParts.push("I wasn't able to turn that into an action. Try one of the quick prompts, or be more specific.");
  }

  return {
    plan: { role, toolCalls, rationale: `Parsed "${text}" into ${toolCalls.length} tool call(s) via the offline AI Director.` },
    executed,
    denied,
    narration: narrationParts.join(' '),
    document: next,
  };
}
