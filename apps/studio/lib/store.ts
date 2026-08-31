'use client';

import { create } from 'zustand';
import { diffWorlds, randomUuid, touchWorld, type CameraMode, type WorldDiff, type WorldEnvironment } from '@sonic-gameworld/world-schema';
import type { Biome } from '@sonic-gameworld/rts-sim';
import type { AIDenied, CameraRig, CinematicSequence, EntityPatch, MissionDefinition, ToolExecution, World, WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
import { defaultRtsMapConfig, getRtsMapConfig, paintRtsCoverCells, withRtsMapConfig, type RtsMapConfig } from './rtsMap';

const MAX_HISTORY = 50;

export interface LogEntry {
  id: string;
  at: string;
  kind: 'plan' | 'executed' | 'denied' | 'narration' | 'system';
  role?: string;
  tool?: string;
  text: string;
  ok?: boolean;
  raw?: ToolExecution | AIDenied;
}

interface HistoryFrame {
  document: WorldDocument;
  diff: WorldDiff;
}

export interface StudioState {
  // --- world document + metadata ---
  worldMeta: World | null;
  document: WorldDocument | null;
  offline: boolean;
  loading: boolean;
  loadError: string | null;

  // --- selection & UI ---
  selection: string[];
  hoveredId: string | null;
  cameraMode: CameraMode;
  trackedEntityId: string | null;
  inspectorTab: string;

  // --- edit tracking ---
  dirty: boolean;
  past: HistoryFrame[];
  future: HistoryFrame[];

  // --- AI Director ---
  aiBusy: boolean;
  executionLog: LogEntry[];

  // --- actions ---
  loadWorld: (doc: WorldDocument, meta: World, offline: boolean) => void;
  setLoading: (v: boolean, error?: string | null) => void;
  mergeRemotePatch: (patch: Partial<WorldDocument>) => void;

  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive?: boolean) => void;
  setHovered: (id: string | null) => void;
  setCameraMode: (mode: CameraMode) => void;
  setTrackedEntity: (id: string | null) => void;
  setInspectorTab: (tab: string) => void;

  commitDocument: (next: WorldDocument, label: string) => void;
  updateEntity: (id: string, patch: EntityPatch) => void;
  addEntity: (entity: WorldEntity) => void;
  removeEntity: (id: string) => void;
  reparentEntity: (id: string, parentId: string | undefined) => void;
  toggleLayerVisible: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  setEnvironment: (patch: Partial<WorldEnvironment>) => void;

  // RTS map authoring (docs/RTS-CONTRACTS.md §6/§9) — see lib/rtsMap.ts for the persisted shape.
  rtsMapConfig: () => RtsMapConfig;
  setRtsBiome: (biome: Biome) => void;
  paintRtsCoverCells: (cells: { cellX: number; cellZ: number }[], value: 0 | 1) => void;

  addMission: (mission: MissionDefinition) => void;
  updateMission: (id: string, patch: Partial<MissionDefinition>) => void;
  removeMission: (id: string) => void;

  addCameraRig: (rig: CameraRig) => void;
  updateCameraRig: (id: string, patch: Partial<CameraRig>) => void;
  removeCameraRig: (id: string) => void;

  // Cinematic sequences (shot lists over camera rigs) are a studio-only concept layered on top
  // of the canonical WorldDocument schema (which has no `cinematics` field) — kept as separate,
  // non-undoable session state rather than smuggled into the document.
  cinematicSequences: CinematicSequence[];
  addSequence: (seq: CinematicSequence) => void;
  updateSequence: (id: string, patch: Partial<CinematicSequence>) => void;
  removeSequence: (id: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  markSaved: () => void;

  pushLog: (entry: Omit<LogEntry, 'id' | 'at'>) => void;
  setAiBusy: (v: boolean) => void;
  clearLog: () => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  worldMeta: null,
  document: null,
  offline: false,
  loading: true,
  loadError: null,

  selection: [],
  hoveredId: null,
  cameraMode: 'ORBIT',
  trackedEntityId: null,
  inspectorTab: 'transform',

  dirty: false,
  past: [],
  future: [],

  aiBusy: false,
  executionLog: [],

  loadWorld: (doc, meta, offline) =>
    set({
      document: doc,
      worldMeta: meta,
      offline,
      loading: false,
      loadError: null,
      dirty: false,
      past: [],
      future: [],
      selection: [],
    }),

  setLoading: (v, error = null) => set({ loading: v, loadError: error }),

  mergeRemotePatch: (patch) =>
    set((s) => {
      if (!s.document) return {};
      const merged: WorldDocument = {
        ...s.document,
        ...patch,
        environment: patch.environment ? { ...s.document.environment, ...patch.environment } : s.document.environment,
        entities: patch.entities
          ? mergeById(s.document.entities, patch.entities)
          : s.document.entities,
        layers: patch.layers ? mergeById(s.document.layers, patch.layers) : s.document.layers,
        missions: patch.missions ? mergeById(s.document.missions, patch.missions) : s.document.missions,
        cameras: patch.cameras ? mergeById(s.document.cameras, patch.cameras) : s.document.cameras,
      };
      return { document: merged };
    }),

  select: (ids) => set({ selection: ids }),
  toggleSelect: (id, additive = false) =>
    set((s) => {
      if (!additive) return { selection: s.selection.includes(id) && s.selection.length === 1 ? [] : [id] };
      return { selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] };
    }),
  setHovered: (id) => set({ hoveredId: id }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setTrackedEntity: (id) => set({ trackedEntityId: id, cameraMode: id ? 'FOLLOW' : get().cameraMode }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  commitDocument: (next, label) =>
    set((s) => {
      if (!s.document) return { document: next, dirty: true };
      const diff = diffWorlds(s.document, next);
      if (diff.empty) return {};
      const frame: HistoryFrame = { document: s.document, diff };
      return {
        document: touchWorld(next, s.worldMeta?.ownerId ?? 'studio-user', label),
        dirty: true,
        past: [...s.past, frame].slice(-MAX_HISTORY),
        future: [],
      };
    }),

  updateEntity: (id, patch) => {
    const { document, commitDocument } = get();
    if (!document) return;
    const next: WorldDocument = {
      ...document,
      entities: document.entities.map((e) => (e.id === id ? ({ ...e, ...patch } as WorldEntity) : e)),
    };
    commitDocument(next, `Edited ${document.entities.find((e) => e.id === id)?.name ?? id}`);
  },

  addEntity: (entity) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument({ ...document, entities: [...document.entities, entity] }, `Added ${entity.name}`);
  },

  removeEntity: (id) => {
    const { document, commitDocument, selection } = get();
    if (!document) return;
    const removedIds = new Set([id, ...descendantIds(document, id)]);
    const target = document.entities.find((e) => e.id === id);
    commitDocument(
      { ...document, entities: document.entities.filter((e) => !removedIds.has(e.id)) },
      `Deleted ${target?.name ?? id}`,
    );
    set({ selection: selection.filter((s) => !removedIds.has(s)) });
  },

  reparentEntity: (id, parentId) => {
    const { document, commitDocument } = get();
    if (!document) return;
    if (id === parentId) return;
    if (parentId && descendantIds(document, id).includes(parentId)) return; // no cycles
    const next: WorldDocument = {
      ...document,
      entities: document.entities.map((e) => (e.id === id ? { ...e, parentId } : e)),
    };
    commitDocument(next, `Reparented ${document.entities.find((e) => e.id === id)?.name ?? id}`);
  },

  toggleLayerVisible: (layerId) => {
    const { document, commitDocument } = get();
    if (!document) return;
    const next: WorldDocument = {
      ...document,
      layers: document.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    };
    commitDocument(next, `Toggled layer visibility`);
  },

  toggleLayerLock: (layerId) => {
    const { document, commitDocument } = get();
    if (!document) return;
    const next: WorldDocument = {
      ...document,
      layers: document.layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
    };
    commitDocument(next, `Toggled layer lock`);
  },

  setEnvironment: (patch) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument({ ...document, environment: { ...document.environment, ...patch } }, 'Updated environment');
  },

  rtsMapConfig: () => {
    const { document } = get();
    return document ? getRtsMapConfig(document) : defaultRtsMapConfig();
  },
  setRtsBiome: (biome) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument(withRtsMapConfig(document, { biome }), `Set RTS biome to ${biome}`);
  },
  paintRtsCoverCells: (cells, value) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument(paintRtsCoverCells(document, cells, value), value ? 'Painted RTS cover cells' : 'Erased RTS cover cells');
  },

  addMission: (mission) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument({ ...document, missions: [...document.missions, mission] }, `Added mission ${mission.name}`);
  },
  updateMission: (id, patch) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument(
      { ...document, missions: document.missions.map((m) => (m.id === id ? { ...m, ...patch } : m)) },
      `Edited mission ${document.missions.find((m) => m.id === id)?.name ?? id}`,
    );
  },
  removeMission: (id) => {
    const { document, commitDocument } = get();
    if (!document) return;
    const target = document.missions.find((m) => m.id === id);
    commitDocument({ ...document, missions: document.missions.filter((m) => m.id !== id) }, `Deleted mission ${target?.name ?? id}`);
  },

  addCameraRig: (rig) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument({ ...document, cameras: [...document.cameras, rig] }, `Added camera rig ${rig.name}`);
  },
  updateCameraRig: (id, patch) => {
    const { document, commitDocument } = get();
    if (!document) return;
    commitDocument(
      { ...document, cameras: document.cameras.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
      `Edited camera rig ${document.cameras.find((r) => r.id === id)?.name ?? id}`,
    );
  },
  removeCameraRig: (id) => {
    const { document, commitDocument } = get();
    if (!document) return;
    const target = document.cameras.find((r) => r.id === id);
    commitDocument({ ...document, cameras: document.cameras.filter((r) => r.id !== id) }, `Deleted camera rig ${target?.name ?? id}`);
    set((s) => ({ cinematicSequences: s.cinematicSequences.filter((seq) => !seq.shots.some((sh) => sh.rigId === id)) }));
  },

  cinematicSequences: [],
  addSequence: (seq) => set((s) => ({ cinematicSequences: [...s.cinematicSequences, seq] })),
  updateSequence: (id, patch) =>
    set((s) => ({ cinematicSequences: s.cinematicSequences.map((seq) => (seq.id === id ? { ...seq, ...patch } : seq)) })),
  removeSequence: (id) => set((s) => ({ cinematicSequences: s.cinematicSequences.filter((seq) => seq.id !== id) })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !s.document) return {};
      return {
        document: prev.document,
        past: s.past.slice(0, -1),
        future: [{ document: s.document, diff: prev.diff }, ...s.future],
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      const nextFrame = s.future[0];
      if (!nextFrame || !s.document) return {};
      return {
        document: nextFrame.document,
        future: s.future.slice(1),
        past: [...s.past, { document: s.document, diff: nextFrame.diff }],
        dirty: true,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  markSaved: () => set({ dirty: false }),

  pushLog: (entry) =>
    set((s) => ({
      executionLog: [...s.executionLog, { id: randomUuid(), at: new Date().toISOString(), ...entry }].slice(-200),
    })),
  setAiBusy: (v) => set({ aiBusy: v }),
  clearLog: () => set({ executionLog: [] }),
}));

function descendantIds(doc: WorldDocument, rootId: string): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const e of doc.entities) {
      if (e.parentId === current) {
        out.push(e.id);
        stack.push(e.id);
      }
    }
  }
  return out;
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((x) => [x.id, x] as const));
  for (const item of incoming) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function selectedEntities(doc: WorldDocument | null, selection: string[]): WorldEntity[] {
  if (!doc) return [];
  const set = new Set(selection);
  return doc.entities.filter((e) => set.has(e.id));
}
