import * as THREE from 'three';
import type { EntityKind, LayerKind, Transform, WorldEntity } from '@sonic-gameworld/world-schema';
import { ENTITY_KIND_COLORS, ENTITY_KIND_RADIUS, RENDERABLE_KINDS } from '../types.js';
import { loadGLTF } from './gltf.js';

/**
 * `WorldEntity.metadata` key an entity can set to select a geometry *sub*-bucket within its
 * `EntityKind`'s shared `InstancedMesh` bucket — see `bucketFor`/`geometryForKind` below. Currently
 * only `RTS_UNIT`/`RTS_BUILDING` use this (`rts/syncEntities.ts` sets it from `unitClass`/
 * `isNavalUnit`/`buildingClass`); an entity with no value here, or a value `geometryForKind` doesn't
 * recognize for its kind, renders on that kind's original single default bucket exactly as before —
 * this is what keeps every non-RTS `WorldEntity`, and any RTS_UNIT/RTS_BUILDING spawned by a caller
 * that predates this (e.g. a bare Studio-palette placeholder with no match state yet), unaffected.
 */
export const GEOMETRY_BUCKET_METADATA_KEY = 'geometryBucket';

/**
 * `WorldEntity.metadata` key for a per-instance tint (a `#rrggbb` hex string), applied instead of
 * the kind's shared `ENTITY_KIND_COLORS` base tint when set. `rts/syncEntities.ts` uses this to
 * carry `getTeamColor(factionId, biome)` onto each spawned RTS_UNIT/RTS_BUILDING instance, since
 * per-faction tinting only makes sense per-instance, not per-bucket.
 */
export const TEAM_COLOR_METADATA_KEY = 'teamColor';

/** The only `GEOMETRY_BUCKET_METADATA_KEY` values `geometryForKind` actually branches on, per kind
 * (see `geometryForRTSUnitBucket`/`geometryForRTSBuildingBucket` above) — every other kind ignores
 * the metadata key entirely, and an unrecognized value for a kind that *does* use it collapses to
 * that kind's single default bucket rather than fragmenting into a redundant identical-geometry
 * bucket. Keeps a stray/misspelled hint, or one set on the wrong kind, harmless instead of quietly
 * wasting a draw call. */
const RTS_UNIT_GEOMETRY_BUCKETS = new Set(['INFANTRY', 'ARMORED', 'AIR', 'NAVAL']);
const RTS_BUILDING_GEOMETRY_BUCKETS = new Set(['PRODUCTION', 'TECH']);

function geometryBucketOf(entity: WorldEntity): string | undefined {
  const value = entity.metadata?.[GEOMETRY_BUCKET_METADATA_KEY];
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (entity.kind === 'RTS_UNIT') return RTS_UNIT_GEOMETRY_BUCKETS.has(value) ? value : undefined;
  if (entity.kind === 'RTS_BUILDING') return RTS_BUILDING_GEOMETRY_BUCKETS.has(value) ? value : undefined;
  return undefined;
}

function teamColorOf(entity: WorldEntity): string | undefined {
  const value = entity.metadata?.[TEAM_COLOR_METADATA_KEY];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Composite key `buckets` is actually keyed by — `kind` alone when there's no sub-bucket variant
 * (every non-RTS kind, and any RTS entity without a recognized `geometryBucket` hint), `kind::variant`
 * when there is, so different variants of the same `EntityKind` never share an `InstancedMesh`. */
function bucketKeyFor(kind: EntityKind, variant: string | undefined): string {
  return variant ? `${kind}::${variant}` : kind;
}

export const ENTITY_KIND_TO_LAYER: Record<EntityKind, LayerKind> = {
  REGION: 'ENTITIES',
  ZONE: 'ENTITIES',
  BUILDING: 'BUILDINGS',
  ROOM: 'BUILDINGS',
  NPC: 'NPCS',
  PLAYER_SPAWN: 'ENTITIES',
  ITEM: 'ENTITIES',
  VEHICLE: 'VEHICLES',
  TRIGGER: 'TRIGGERS',
  CAMERA: 'CAMERAS',
  LIGHT: 'ENVIRONMENT',
  PROP: 'ENTITIES',
  TERRAIN: 'TERRAIN',
  WATER: 'WATER',
  ROAD: 'ROADS',
  VOLUME: 'TRIGGERS',
  GROUP: 'ENTITIES',
  // RTS game template (docs/RTS-CONTRACTS.md §6): dedicated layers rather than reusing
  // VEHICLES/BUILDINGS, so a creator can toggle RTS unit/building visibility independently of
  // the generic entity-palette layers those already serve.
  RTS_UNIT: 'RTS_UNITS',
  RTS_BUILDING: 'RTS_BUILDINGS',
};

const INITIAL_CAPACITY = 32;

/**
 * Sub-bucket geometry for `RTS_UNIT` (see `RTSUnitGeometryBucket` in `../types.ts`). Each variant
 * is still a single cheap primitive — no merged/multi-part meshes — so every bucket stays one draw
 * call for however many units share it, exactly like the pre-existing shared-capsule bucket did;
 * only the *shape* now varies by unit family instead of just per-instance `transform.scale`
 * (`rts/syncEntities.ts` still layers per-`unitClass` scale on top of whichever bucket a unit
 * lands in, for extra size read within a family). An unrecognized/absent variant (a bare
 * `RTS_UNIT` spawned outside `syncRTSEntities`, e.g. a Studio-palette placeholder) falls back to
 * the original generic-infantry-shaped capsule so it renders exactly as it did before this change.
 */
function geometryForRTSUnitBucket(radius: number, variant: string | undefined): THREE.BufferGeometry {
  switch (variant) {
    case 'ARMORED':
      // Low, wide box — tank/APC silhouette, distinct from infantry at a glance.
      return new THREE.BoxGeometry(radius * 1.6, radius * 0.7, radius * 2.2);
    case 'AIR':
      // Flattened diamond/wing — an Octahedron squashed on Y reads as a small aircraft silhouette
      // from the RTS camera's steep overhead pitch without a dedicated wing mesh.
      return new THREE.OctahedronGeometry(radius * 1.1, 0).scale(1.4, 0.35, 1);
    case 'NAVAL':
      // Elongated, flat hull box — reads as a ship, not a tank, despite sharing `unitClass:
      // 'ARMORED'` in rts-sim (see that package's README on why naval archetypes don't get their
      // own UnitClass).
      return new THREE.BoxGeometry(radius * 1.3, radius * 0.5, radius * 3.2);
    case 'INFANTRY':
    default:
      // Thin capsule — approximates "a squad" silhouette by proportion (narrow + upright) rather
      // than literally merging multiple capsules into one geometry, which would cost real
      // triangle/attribute-merge complexity for a shape that reads the same at RTS zoom anyway.
      return new THREE.CapsuleGeometry(radius * 0.35, radius * 0.9, 4, 8);
  }
}

/**
 * Sub-bucket geometry for `RTS_BUILDING` (see `RTSBuildingGeometryBucket` in `../types.ts`). Both
 * variants share the same X/Z footprint (`radius * 2`) as the original single box so
 * `rts/syncEntities.ts`'s per-instance footprint scaling (`sizeCells * cellSizeM` against that same
 * base footprint) stays correct regardless of which bucket a building lands in — only height
 * differs, which is enough to read "production building" vs. "tall radar/tech mast" apart.
 */
function geometryForRTSBuildingBucket(radius: number, variant: string | undefined): THREE.BufferGeometry {
  switch (variant) {
    case 'TECH':
      return new THREE.BoxGeometry(radius * 2, radius * 3.2, radius * 2);
    case 'PRODUCTION':
    default:
      return new THREE.BoxGeometry(radius * 2, radius * 1.4, radius * 2);
  }
}

function geometryForKind(kind: EntityKind, radius: number, variant?: string): THREE.BufferGeometry {
  switch (kind) {
    case 'NPC':
    case 'ITEM':
    case 'LIGHT':
      return new THREE.SphereGeometry(radius, 12, 10);
    case 'CAMERA':
      return new THREE.ConeGeometry(radius, radius * 1.6, 8);
    case 'PLAYER_SPAWN':
      return new THREE.ConeGeometry(radius, radius * 2, 16);
    case 'VEHICLE':
      return new THREE.BoxGeometry(radius * 2.2, radius * 1.1, radius * 4.2);
    case 'TRIGGER':
    case 'VOLUME':
      return new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
    // RTS game template (docs/RTS-CONTRACTS.md §6, §9): cheap primitives, sub-bucketed by
    // `GEOMETRY_BUCKET_METADATA_KEY` (see the two helpers above) so dozens of units on screen still
    // share one InstancedMesh *per family* — a handful of draw calls total, not one per archetype.
    case 'RTS_UNIT':
      return geometryForRTSUnitBucket(radius, variant);
    case 'RTS_BUILDING':
      return geometryForRTSBuildingBucket(radius, variant);
    case 'BUILDING':
    case 'ROOM':
    case 'PROP':
    default:
      return new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  }
}

interface InstancedBucket {
  mesh: THREE.InstancedMesh;
  capacity: number;
  count: number;
  idAtIndex: (string | null)[];
  freeList: number[];
  baseColor: THREE.Color;
}

export interface EntitySlot {
  entity: WorldEntity;
  kind: EntityKind;
  /** The `GEOMETRY_BUCKET_METADATA_KEY` value this entity spawned with, if any — remembered here
   * (rather than re-read from `entity.metadata` on every call) so `move`/`remove`/`setSelected`/
   * `applyLOD` always resolve back to the exact same `InstancedBucket` a `mode: 'instanced'` slot
   * was placed in, even if a later `move()` call's `Transform` carries no metadata of its own. */
  variant?: string;
  mode: 'instanced' | 'glb' | 'skipped';
  index?: number;
  object3D?: THREE.Object3D;
  billboard: THREE.Sprite;
  lod: boolean;
  selected: boolean;
}

export interface ResolveAssetUrl {
  (assetRef: NonNullable<WorldEntity['assetRef']>, cdnBaseUrl: string): string;
}

const defaultResolveAssetUrl: ResolveAssetUrl = (assetRef, cdnBaseUrl) => {
  const variant = assetRef.variant ?? 'WEB';
  const base = cdnBaseUrl.replace(/\/$/, '');
  return `${base}/${assetRef.assetId}/${variant.toLowerCase()}.glb`;
};

/**
 * Owns instanced-primitive rendering for every entity kind, GLB loading for entities with an
 * `assetRef` + `cdnBaseUrl`, and the always-present LOD billboard sprites. One InstancedMesh per
 * EntityKind (grown by doubling capacity) keeps draw calls flat regardless of entity count — or,
 * for a kind that opts into `GEOMETRY_BUCKET_METADATA_KEY` sub-bucketing (RTS_UNIT/RTS_BUILDING),
 * one InstancedMesh per (kind, variant) pair: still a small, fixed number of draw calls no matter
 * how many *instances* of that kind exist, just one per visually-distinct *family* now instead of
 * per kind.
 */
export class EntityRegistry {
  readonly slots = new Map<string, EntitySlot>();
  /** Keyed by `bucketKeyFor(kind, variant)` — `kind` alone for the common case, `kind::variant`
   * for a sub-bucketed RTS_UNIT/RTS_BUILDING (see that helper's doc comment above). */
  private buckets = new Map<string, InstancedBucket>();
  private glbGroup = new THREE.Group();
  private billboardGroup = new THREE.Group();
  private layerGroups: Map<LayerKind, THREE.Group>;
  private cdnBaseUrl?: string;
  private resolveAssetUrl: ResolveAssetUrl;
  private onError?: (err: unknown) => void;
  private tmpMatrix = new THREE.Matrix4();
  private tmpQuat = new THREE.Quaternion();
  private tmpPos = new THREE.Vector3();
  private tmpScale = new THREE.Vector3();

  constructor(
    layerGroups: Map<LayerKind, THREE.Group>,
    opts: { cdnBaseUrl?: string; resolveAssetUrl?: ResolveAssetUrl; onError?: (err: unknown) => void } = {},
  ) {
    this.layerGroups = layerGroups;
    this.cdnBaseUrl = opts.cdnBaseUrl;
    this.resolveAssetUrl = opts.resolveAssetUrl ?? defaultResolveAssetUrl;
    this.onError = opts.onError;
    this.layerGroups.get('ENTITIES')?.add(this.glbGroup);
    this.layerGroups.get('ENTITIES')?.add(this.billboardGroup);
  }

  private bucketFor(kind: EntityKind, variant?: string): InstancedBucket {
    const key = bucketKeyFor(kind, variant);
    let bucket = this.buckets.get(key);
    if (bucket) return bucket;
    const radius = ENTITY_KIND_RADIUS[kind] || 1;
    const geometry = geometryForKind(kind, radius, variant);
    const baseColor = new THREE.Color(ENTITY_KIND_COLORS[kind]);
    const material = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.7, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geometry, material, INITIAL_CAPACITY);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const layerKind = ENTITY_KIND_TO_LAYER[kind];
    const group = this.layerGroups.get(layerKind);
    (group ?? this.layerGroups.get('ENTITIES')!).add(mesh);
    bucket = { mesh, capacity: INITIAL_CAPACITY, count: 0, idAtIndex: new Array(INITIAL_CAPACITY).fill(null), freeList: [], baseColor };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private growBucket(bucket: InstancedBucket): void {
    const newCapacity = bucket.capacity * 2;
    const oldMesh = bucket.mesh;
    const newMesh = new THREE.InstancedMesh(oldMesh.geometry, oldMesh.material, newCapacity);
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    newMesh.castShadow = oldMesh.castShadow;
    newMesh.receiveShadow = oldMesh.receiveShadow;
    for (let i = 0; i < bucket.count; i++) {
      oldMesh.getMatrixAt(i, this.tmpMatrix);
      newMesh.setMatrixAt(i, this.tmpMatrix);
      const color = new THREE.Color();
      oldMesh.getColorAt(i, color);
      newMesh.setColorAt(i, color);
    }
    newMesh.count = bucket.count;
    oldMesh.parent?.add(newMesh);
    oldMesh.parent?.remove(oldMesh);
    oldMesh.geometry.dispose();
    (oldMesh.material as THREE.Material).dispose();
    bucket.mesh = newMesh;
    bucket.capacity = newCapacity;
    bucket.idAtIndex = [...bucket.idAtIndex, ...new Array(newCapacity - bucket.idAtIndex.length).fill(null)];
    // update slot indices' mesh reference is implicit (slots store kind, we look up bucket.mesh live)
  }

  private transformToMatrix(t: Transform): THREE.Matrix4 {
    this.tmpPos.set(t.position.x, t.position.y, t.position.z);
    this.tmpQuat.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.tmpScale.set(t.scale.x || 0.0001, t.scale.y || 0.0001, t.scale.z || 0.0001);
    return this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
  }

  private makeBillboard(entity: WorldEntity): THREE.Sprite {
    const color = new THREE.Color(ENTITY_KIND_COLORS[entity.kind]);
    const material = new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const size = Math.max(ENTITY_KIND_RADIUS[entity.kind] || 1, 0.5) * 2.2;
    sprite.scale.set(size, size, 1);
    sprite.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
    sprite.visible = false;
    sprite.userData.entityId = entity.id;
    this.billboardGroup.add(sprite);
    return sprite;
  }

  spawn(entity: WorldEntity): EntitySlot {
    this.remove(entity.id);
    const billboard = this.makeBillboard(entity);
    const canGlb = !!entity.assetRef && !!this.cdnBaseUrl;
    const isRenderable = RENDERABLE_KINDS.includes(entity.kind);

    if (canGlb) {
      const slot: EntitySlot = { entity, kind: entity.kind, mode: 'glb', billboard, lod: false, selected: false };
      this.slots.set(entity.id, slot);
      const placeholder = new THREE.Group();
      placeholder.position.set(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z);
      placeholder.quaternion.set(entity.transform.rotation.x, entity.transform.rotation.y, entity.transform.rotation.z, entity.transform.rotation.w);
      placeholder.scale.set(entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z);
      placeholder.userData.entityId = entity.id;
      this.glbGroup.add(placeholder);
      slot.object3D = placeholder;

      const url = this.resolveAssetUrl(entity.assetRef!, this.cdnBaseUrl!);
      loadGLTF(url)
        .then((gltf) => {
          const current = this.slots.get(entity.id);
          if (!current || current.mode !== 'glb') return; // entity removed/changed while loading
          placeholder.add(gltf.scene);
        })
        .catch((err) => {
          this.onError?.(err);
          // Fall back to the instanced primitive so the world isn't left with an invisible gap.
          this.glbGroup.remove(placeholder);
          const fallback = this.spawnInstanced(entity, billboard);
          this.slots.set(entity.id, fallback);
        });
      return slot;
    }

    if (!isRenderable) {
      const slot: EntitySlot = { entity, kind: entity.kind, mode: 'skipped', billboard, lod: false, selected: false };
      billboard.visible = false;
      this.slots.set(entity.id, slot);
      return slot;
    }

    const slot = this.spawnInstanced(entity, billboard);
    this.slots.set(entity.id, slot);
    return slot;
  }

  private spawnInstanced(entity: WorldEntity, billboard: THREE.Sprite): EntitySlot {
    const variant = geometryBucketOf(entity);
    const bucket = this.bucketFor(entity.kind, variant);
    let index: number;
    if (bucket.freeList.length > 0) {
      index = bucket.freeList.pop()!;
    } else {
      if (bucket.count >= bucket.capacity) this.growBucket(bucket);
      index = bucket.count;
      bucket.count += 1;
      bucket.mesh.count = bucket.count;
    }
    bucket.idAtIndex[index] = entity.id;
    bucket.mesh.setMatrixAt(index, this.transformToMatrix(entity.transform));
    // A per-instance tint (e.g. RTS team color) overrides the bucket's shared base color; falls
    // back to it when the entity carries none, matching pre-existing behavior exactly.
    const tint = teamColorOf(entity);
    bucket.mesh.setColorAt(index, tint ? new THREE.Color(tint) : bucket.baseColor);
    bucket.mesh.instanceMatrix.needsUpdate = true;
    if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    return { entity, kind: entity.kind, variant, mode: 'instanced', index, billboard, lod: false, selected: false };
  }

  move(id: string, transform: Transform): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.entity = { ...slot.entity, transform };
    if (slot.mode === 'instanced' && slot.index !== undefined) {
      const bucket = this.bucketFor(slot.kind, slot.variant);
      bucket.mesh.setMatrixAt(slot.index, this.transformToMatrix(transform));
      bucket.mesh.instanceMatrix.needsUpdate = true;
    } else if (slot.mode === 'glb' && slot.object3D) {
      slot.object3D.position.set(transform.position.x, transform.position.y, transform.position.z);
      slot.object3D.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
      slot.object3D.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    }
    slot.billboard.position.set(transform.position.x, transform.position.y, transform.position.z);
  }

  remove(id: string): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    if (slot.mode === 'instanced' && slot.index !== undefined) {
      const bucket = this.bucketFor(slot.kind, slot.variant);
      bucket.idAtIndex[slot.index] = null;
      bucket.freeList.push(slot.index);
      this.tmpMatrix.makeScale(0, 0, 0);
      bucket.mesh.setMatrixAt(slot.index, this.tmpMatrix);
      bucket.mesh.instanceMatrix.needsUpdate = true;
    } else if (slot.mode === 'glb' && slot.object3D) {
      this.glbGroup.remove(slot.object3D);
      slot.object3D.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    }
    this.billboardGroup.remove(slot.billboard);
    slot.billboard.material.dispose();
    this.slots.delete(id);
  }

  getWorldPosition(id: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    return out.set(slot.entity.transform.position.x, slot.entity.transform.position.y, slot.entity.transform.position.z);
  }

  getWorldQuaternion(id: string, out = new THREE.Quaternion()): THREE.Quaternion | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const r = slot.entity.transform.rotation;
    return out.set(r.x, r.y, r.z, r.w);
  }

  /** Instanced meshes + GLB groups + billboard sprites, in that order — used for raycasting. */
  raycastTargets(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const bucket of this.buckets.values()) meshes.push(bucket.mesh);
    meshes.push(this.glbGroup, this.billboardGroup);
    return meshes;
  }

  resolveHit(object: THREE.Object3D, instanceId?: number): string | null {
    for (const bucket of this.buckets.values()) {
      if (bucket.mesh === object) {
        return instanceId !== undefined ? bucket.idAtIndex[instanceId] ?? null : null;
      }
    }
    let cur: THREE.Object3D | null = object;
    while (cur) {
      if (typeof cur.userData.entityId === 'string') return cur.userData.entityId;
      cur = cur.parent;
    }
    return null;
  }

  setSelected(id: string, selected: boolean): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.selected = selected;
    if (slot.mode === 'instanced' && slot.index !== undefined) {
      const bucket = this.bucketFor(slot.kind, slot.variant);
      // Deselecting must restore this instance's own tint (e.g. RTS team color), not the bucket's
      // shared base color — otherwise a selected-then-deselected unit would lose its team tint.
      const tint = teamColorOf(slot.entity);
      const base = tint ? new THREE.Color(tint) : bucket.baseColor;
      const color = selected ? base.clone().lerp(new THREE.Color(0xffffff), 0.6) : base;
      bucket.mesh.setColorAt(slot.index, color);
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    }
    slot.billboard.material.color.set(selected ? 0xffffff : ENTITY_KIND_COLORS[slot.kind]);
  }

  /** LOD: hide the main representation and show the billboard once `distance` exceeds the threshold. */
  applyLOD(id: string, cameraPosition: THREE.Vector3, thresholdM: number): void {
    const slot = this.slots.get(id);
    if (!slot || slot.mode === 'skipped') return;
    const pos = this.getWorldPosition(id);
    if (!pos) return;
    const far = pos.distanceTo(cameraPosition) > thresholdM;
    if (far === slot.lod) return;
    slot.lod = far;
    slot.billboard.visible = far;
    if (slot.mode === 'instanced' && slot.index !== undefined) {
      const bucket = this.bucketFor(slot.kind, slot.variant);
      const t = { ...slot.entity.transform };
      if (far) {
        this.tmpMatrix.makeScale(0, 0, 0);
        bucket.mesh.setMatrixAt(slot.index, this.tmpMatrix);
      } else {
        bucket.mesh.setMatrixAt(slot.index, this.transformToMatrix(t));
      }
      bucket.mesh.instanceMatrix.needsUpdate = true;
    } else if (slot.mode === 'glb' && slot.object3D) {
      slot.object3D.visible = !far;
    }
  }

  entityIds(): string[] {
    return Array.from(this.slots.keys());
  }

  clear(): void {
    for (const id of Array.from(this.slots.keys())) this.remove(id);
    for (const bucket of this.buckets.values()) {
      bucket.mesh.geometry.dispose();
      (bucket.mesh.material as THREE.Material).dispose();
      bucket.mesh.parent?.remove(bucket.mesh);
    }
    this.buckets.clear();
  }
}
