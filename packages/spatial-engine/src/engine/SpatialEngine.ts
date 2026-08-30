import * as THREE from 'three';
import {
  LAYER_KINDS,
  type CameraMode,
  type CameraRig,
  type CinematicSequence,
  type LayerKind,
  type Transform,
  type WorldDocument,
  type WorldEntity,
  type WorldEnvironment,
  type WorldLayer,
} from '@sonic-gameworld/world-schema';
import { TinyEmitter, type Unsubscribe } from '../events.js';
import type {
  HUDState,
  RaycastHit,
  SetCameraModeOptions,
  SpatialEngineEventMap,
  SpatialEngineOptions,
  SpatialSnapshot,
} from '../types.js';
import { CameraController } from '../camera/CameraController.js';
import { createRenderer } from './renderer.js';
import { EntityRegistry } from './entities.js';
import { DetectionOverlay } from './detection.js';
import { EnvironmentController } from './environment.js';
import { CinematicPlayer } from './cinematic.js';
import { localPointToGeo } from './geo.js';
import type { RTSMatchState } from '@sonic-gameworld/rts-sim';
import { syncRTSEntities, type SyncRTSEntitiesOptions } from '../rts/syncEntities.js';

const DEFAULT_LOD_DISTANCE_M = 140;

/**
 * Framework-agnostic Three.js scene/camera/entity manager for a GameWorld document. No React, no DOM
 * assumptions beyond an optional `<canvas>` — safe to construct on the server (headless: a NullRenderer
 * stands in for WebGL) or in a test runner.
 */
export class SpatialEngine {
  readonly scene = new THREE.Scene();
  readonly cameraController: CameraController;

  private renderer: ReturnType<typeof createRenderer>;
  private raycaster = new THREE.Raycaster();
  private layerGroups = new Map<LayerKind, THREE.Group>();
  private entityRegistry: EntityRegistry;
  private detectionOverlay: DetectionOverlay;
  private environmentController: EnvironmentController;
  private cinematicPlayer = new CinematicPlayer();
  private emitter = new TinyEmitter<SpatialEngineEventMap>();

  private doc: WorldDocument | null = null;
  private layerState = new Map<string, WorldLayer>();
  private selection = new Set<string>();
  private trackedId: string | null = null;
  private lastCursorGeo: { lat: number; lon: number; altM: number } | undefined;
  /** Saved camera state to restore on `releasePossession()` — see the "possession" section below. */
  private prePossession: { mode: CameraMode; targetEntityId: string | null; params: CameraRig['params'] } | null = null;

  private width: number;
  private height: number;
  private rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;
  private lastFrameTime = 0;
  private fps = 0;
  private elapsedTime = 0;
  private lodDistanceM: number;

  constructor(private readonly options: SpatialEngineOptions = {}) {
    this.width = options.width ?? options.canvas?.clientWidth ?? 800;
    this.height = options.height ?? options.canvas?.clientHeight ?? 600;
    this.renderer = createRenderer({
      canvas: options.canvas,
      renderer: options.renderer,
      width: this.width,
      height: this.height,
      pixelRatio: options.pixelRatio,
      antialias: options.antialias,
      onError: options.onError,
    });
    this.scene.background = new THREE.Color(options.background ?? '#05070B');
    this.cameraController = new CameraController(this.width / Math.max(this.height, 1));

    for (const kind of LAYER_KINDS) {
      const group = new THREE.Group();
      group.name = kind;
      group.visible = kind !== 'DETECTION' && kind !== 'SENSORS';
      this.scene.add(group);
      this.layerGroups.set(kind, group);
    }

    this.entityRegistry = new EntityRegistry(this.layerGroups, {
      cdnBaseUrl: options.cdnBaseUrl,
      resolveAssetUrl: options.resolveAssetUrl,
      onError: options.onError,
    });
    this.detectionOverlay = new DetectionOverlay(this.layerGroups.get('DETECTION')!, this.layerGroups.get('SENSORS')!);
    this.environmentController = new EnvironmentController(this.scene, this.layerGroups.get('ENVIRONMENT')!);
    this.environmentController.setEnvironment({ timeOfDay: 12, weather: 'CLEAR', weatherIntensity: 0, gravity: -9.81 });
    this.lodDistanceM = DEFAULT_LOD_DISTANCE_M;
  }

  // ---------------------------------------------------------------- world lifecycle

  loadWorld(doc: WorldDocument): void {
    this.entityRegistry.clear();
    this.detectionOverlay.dispose();
    this.selection.clear();
    this.trackedId = null;
    this.prePossession = null;
    this.cinematicPlayer.stop();
    this.layerState.clear();

    this.doc = doc;
    for (const layer of doc.layers) {
      this.layerState.set(layer.id, layer);
      const group = this.layerGroups.get(layer.kind);
      if (group) group.visible = layer.visible;
    }
    for (const entity of doc.entities) {
      this.entityRegistry.spawn(entity);
      this.detectionOverlay.sync(entity);
    }
    this.environmentController.setEnvironment(doc.environment);
    this.cameraController.setFocusOverride(null);
    this.emitter.emit('entityChange', { type: 'load', id: null });
  }

  get document(): WorldDocument | null {
    return this.doc;
  }

  getEntity(id: string): WorldEntity | undefined {
    return this.doc?.entities.find((e) => e.id === id);
  }

  getLayers(): WorldLayer[] {
    return Array.from(this.layerState.values()).sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------- entities

  spawn(entity: WorldEntity): void {
    if (!this.doc) throw new Error('SpatialEngine.spawn: no world loaded — call loadWorld() first');
    const idx = this.doc.entities.findIndex((e) => e.id === entity.id);
    if (idx >= 0) this.doc.entities[idx] = entity;
    else this.doc.entities.push(entity);
    this.entityRegistry.spawn(entity);
    this.detectionOverlay.sync(entity);
    this.emitter.emit('entityChange', { type: 'spawn', id: entity.id });
  }

  move(id: string, transform: Transform): void {
    const entity = this.getEntity(id);
    if (!entity || !this.doc) return;
    const updated: WorldEntity = { ...entity, transform };
    const idx = this.doc.entities.findIndex((e) => e.id === id);
    if (idx >= 0) this.doc.entities[idx] = updated;
    this.entityRegistry.move(id, transform);
    this.detectionOverlay.sync(updated);
    this.emitter.emit('entityChange', { type: 'move', id });
  }

  remove(id: string): void {
    if (this.doc) {
      const idx = this.doc.entities.findIndex((e) => e.id === id);
      if (idx >= 0) this.doc.entities.splice(idx, 1);
    }
    this.entityRegistry.remove(id);
    this.detectionOverlay.remove(id);
    this.selection.delete(id);
    if (this.trackedId === id) this.trackedId = null;
    this.emitter.emit('entityChange', { type: 'remove', id });
  }

  // ---------------------------------------------------------------- selection / tracking

  select(ids: string[]): void {
    for (const id of this.selection) if (!ids.includes(id)) this.entityRegistry.setSelected(id, false);
    this.selection = new Set(ids);
    for (const id of ids) this.entityRegistry.setSelected(id, true);
    this.emitter.emit('select', { ids: Array.from(this.selection) });
  }

  getSelection(): string[] {
    return Array.from(this.selection);
  }

  track(entityId: string | null): void {
    this.trackedId = entityId;
    this.cameraController.setFocusOverride(null);
  }

  getTracked(): string | null {
    return this.trackedId;
  }

  // ---------------------------------------------------------------- camera

  setCameraMode(mode: CameraMode, opts: SetCameraModeOptions = {}): void {
    if (opts.targetEntityId !== undefined) this.track(opts.targetEntityId);
    const sample = this.sampleTracked();
    const keyframes = opts.keyframes ?? this.doc?.cameras.find((r) => r.mode === mode)?.keyframes ?? [];
    this.cameraController.setMode(mode, opts.params, keyframes, sample);
    this.emitter.emit('cameraChange', { mode });
  }

  getCameraMode(): CameraMode {
    return this.cameraController.getMode();
  }

  /** Fits the current camera to the bounding sphere of the given entities (a one-shot framing action, not a persistent mode). */
  frame(ids: string[]): void {
    const box = new THREE.Box3();
    let any = false;
    for (const id of ids) {
      const p = this.entityRegistry.getWorldPosition(id);
      if (p) {
        box.expandByPoint(p);
        any = true;
      }
    }
    if (!any) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 5);
    this.cameraController.setFocusOverride(center);
    this.setCameraMode('ORBIT', {
      params: { distance: radius * 2.2, height: Math.max(radius * 0.8, 6), damping: 1 },
    });
  }

  /**
   * Switches the camera to first/third-person control of `entityId` (docs/RTS-CONTRACTS.md §6
   * "possession"). `FIRST_PERSON`/`THIRD_PERSON` are pre-existing, working camera modes — this is
   * a thin convenience wrapper around the existing `setCameraMode`/`track` runtime, not a new
   * camera mode: it remembers whatever camera mode/target/params were active *before* possession
   * (once, on the first call — calling this again while already possessing does not overwrite the
   * saved pre-possession state) so `releasePossession()` can put the camera back exactly where it
   * was, e.g. the RTS overview camera, when the player hits the documented "return to overview"
   * keybind (Escape, per §7).
   */
  possessEntity(entityId: string, mode: Extract<CameraMode, 'FIRST_PERSON' | 'THIRD_PERSON'> = 'FIRST_PERSON', params?: CameraRig['params']): void {
    if (!this.prePossession) {
      this.prePossession = { mode: this.cameraController.getMode(), targetEntityId: this.trackedId, params: this.cameraController.getParams() };
    }
    this.setCameraMode(mode, { targetEntityId: entityId, params });
  }

  /** Restores whatever camera mode/target/params were active before `possessEntity()` was first called. No-op if not currently possessing. */
  releasePossession(): void {
    const restore = this.prePossession;
    if (!restore) return;
    this.prePossession = null;
    this.track(restore.targetEntityId); // may be null (nothing was tracked before possession) — track(null) is valid and intentional here.
    this.setCameraMode(restore.mode, { params: restore.params });
  }

  isPossessing(): boolean {
    return this.prePossession !== null;
  }

  private sampleTracked(): { position: THREE.Vector3; quaternion: THREE.Quaternion } | null {
    if (!this.trackedId) return null;
    const position = this.entityRegistry.getWorldPosition(this.trackedId);
    const quaternion = this.entityRegistry.getWorldQuaternion(this.trackedId);
    if (!position || !quaternion) return null;
    return { position, quaternion };
  }

  // ---------------------------------------------------------------- layers

  setLayerVisible(layerId: string, visible: boolean): void {
    const layer = this.layerState.get(layerId);
    if (!layer) return;
    const updated = { ...layer, visible };
    this.layerState.set(layerId, updated);
    const group = this.layerGroups.get(layer.kind);
    if (group) group.visible = visible;
    if (this.doc) {
      const idx = this.doc.layers.findIndex((l) => l.id === layerId);
      if (idx >= 0) this.doc.layers[idx] = updated;
    }
  }

  isLayerVisible(layerId: string): boolean {
    return this.layerState.get(layerId)?.visible ?? false;
  }

  // ---------------------------------------------------------------- environment

  setEnvironment(env: Partial<WorldEnvironment>): void {
    const base = this.doc?.environment ?? this.environmentController.getEnvironment();
    const merged: WorldEnvironment = { ...base, ...env };
    if (this.doc) this.doc.environment = merged;
    this.environmentController.setEnvironment(merged);
  }

  getEnvironment(): WorldEnvironment {
    return this.environmentController.getEnvironment();
  }

  // ---------------------------------------------------------------- picking

  raycast(ndc: { x: number; y: number }): RaycastHit | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.cameraController.camera);
    const targets = this.entityRegistry.raycastTargets();
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      const id = this.entityRegistry.resolveHit(hit.object, hit.instanceId);
      if (id) {
        const result: RaycastHit = { entityId: id, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, distance: hit.distance };
        if (this.doc?.origin) this.lastCursorGeo = localPointToGeo(this.doc.origin, result.point);
        return result;
      }
    }
    return null;
  }

  hoverAt(ndc: { x: number; y: number }): RaycastHit | null {
    const hit = this.raycast(ndc);
    this.emitter.emit('hover', { id: hit?.entityId ?? null });
    return hit;
  }

  selectAt(ndc: { x: number; y: number }): RaycastHit | null {
    const hit = this.raycast(ndc);
    this.select(hit ? [hit.entityId] : []);
    return hit;
  }

  // ---------------------------------------------------------------- RTS integration (docs/RTS-CONTRACTS.md §6/§7)

  /**
   * Mirrors an `rts-sim` `RTSMatchState` onto this engine's entities — a thin wrapper around the
   * free `syncRTSEntities()` export (`../rts/syncEntities.js`) so `apps/player`'s RTS HUD can drive
   * it from an `SpatialEngine` instance without needing direct access to the private
   * `EntityRegistry` this class owns. Call once per render frame, after `tickMatch()`.
   */
  syncRTSEntities(state: RTSMatchState, opts?: SyncRTSEntitiesOptions): void {
    syncRTSEntities(state, this.entityRegistry, opts);
  }

  // ---------------------------------------------------------------- cinematics

  playCinematic(seq: CinematicSequence): void {
    this.cinematicPlayer.play(seq);
  }

  stopCinematic(): void {
    this.cinematicPlayer.stop();
  }

  // ---------------------------------------------------------------- HUD & snapshots

  getHUDState(): HUDState {
    const counts = { players: 0, npcs: 0, vehicles: 0, events: 0, missions: this.doc?.missions.length ?? 0 };
    for (const e of this.doc?.entities ?? []) {
      if (e.kind === 'PLAYER_SPAWN') counts.players += 1;
      else if (e.kind === 'NPC') counts.npcs += 1;
      else if (e.kind === 'VEHICLE') counts.vehicles += 1;
      else if (e.kind === 'TRIGGER') counts.events += 1;
    }
    const env = this.environmentController.getEnvironment();
    return {
      mode: this.cameraController.getMode(),
      fps: Math.round(this.fps * 10) / 10,
      tracked: this.trackedId,
      counts,
      cursorGeo: this.lastCursorGeo,
      selection: this.getSelection(),
      cinematic: this.cinematicPlayer.getState(),
      weather: env.weather,
      timeOfDay: env.timeOfDay,
    };
  }

  recordSnapshot(): SpatialSnapshot {
    this.renderer.render(this.scene, this.cameraController.camera);
    const domEl = this.renderer.domElement;
    const png = typeof domEl.toDataURL === 'function' ? domEl.toDataURL('image/png') || '' : '';
    const cam = this.cameraController.camera;
    const cameraTransform: Transform = {
      position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      rotation: { x: cam.quaternion.x, y: cam.quaternion.y, z: cam.quaternion.z, w: cam.quaternion.w },
      scale: { x: 1, y: 1, z: 1 },
    };
    return {
      takenAt: new Date().toISOString(),
      json: {
        worldId: this.doc?.id ?? null,
        timeOfDay: this.environmentController.getEnvironment().timeOfDay,
        weather: this.environmentController.getEnvironment().weather,
        cameraMode: this.cameraController.getMode(),
        cameraTransform,
        selection: this.getSelection(),
        tracked: this.trackedId,
        entityCount: this.doc?.entities.length ?? 0,
        hud: this.getHUDState(),
      },
      png,
    };
  }

  // ---------------------------------------------------------------- lifecycle / loop

  on<K extends keyof SpatialEngineEventMap>(event: K, fn: (payload: SpatialEngineEventMap[K]) => void): Unsubscribe {
    return this.emitter.on(event, fn);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.cameraController.setAspect(this.width / Math.max(this.height, 1));
  }

  /** Steps the simulation by `dtSeconds` (or a measured wall-clock delta when omitted, e.g. inside a RAF loop) and renders one frame. */
  tick(dtSeconds?: number): void {
    const dt = dtSeconds ?? this.measureDt();
    this.elapsedTime += dt;
    this.updateFps(dt);

    if (this.doc) {
      const rigsById = new Map(this.doc.cameras.map((r) => [r.id, r] as const));
      const cin = this.cinematicPlayer.tick(dt, rigsById);
      if (cin.activatedShot) {
        const { rig, transition } = cin.activatedShot;
        this.setCameraMode(rig.mode, { targetEntityId: rig.targetEntityId, params: rig.params, keyframes: rig.keyframes });
        this.emitter.emit('cameraChange', { mode: rig.mode, transition });
      }
    }

    const sample = this.sampleTracked();
    this.cameraController.update(dt, sample, this.width, this.height);
    this.environmentController.tick(dt, this.cameraController.camera.position);

    for (const id of this.entityRegistry.entityIds()) {
      this.entityRegistry.applyLOD(id, this.cameraController.camera.position, this.lodDistanceM);
    }

    this.renderer.render(this.scene, this.cameraController.camera);
    this.emitter.emit('tick', { dt, elapsed: this.elapsedTime });
  }

  private measureDt(): number {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = this.lastFrameTime ? Math.min(now - this.lastFrameTime, 0.25) : 1 / 60;
    this.lastFrameTime = now;
    return dt;
  }

  private updateFps(dt: number): void {
    if (dt <= 0) return;
    const instant = 1 / dt;
    this.fps = this.fps ? this.fps * 0.9 + instant * 0.1 : instant;
  }

  /** Starts an internal requestAnimationFrame loop. No-op outside a browser (SSR/tests should call `tick()` manually). */
  start(): void {
    if (this.rafHandle !== null || typeof requestAnimationFrame === 'undefined') return;
    this.lastFrameTime = 0;
    const loop = () => {
      this.tick();
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }

  dispose(): void {
    this.stop();
    this.entityRegistry.clear();
    this.detectionOverlay.dispose();
    this.environmentController.dispose();
    this.renderer.dispose();
    this.emitter.clear();
  }
}
