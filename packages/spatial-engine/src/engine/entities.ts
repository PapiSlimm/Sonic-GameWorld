import * as THREE from 'three';
import type { EntityKind, LayerKind, Transform, WorldEntity } from '@sonic-gameworld/world-schema';
import { ENTITY_KIND_COLORS, ENTITY_KIND_RADIUS, RENDERABLE_KINDS } from '../types.js';
import { loadGLTF } from './gltf.js';

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

function geometryForKind(kind: EntityKind, radius: number): THREE.BufferGeometry {
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
    // RTS game template (docs/RTS-CONTRACTS.md §6): cheap primitives — dozens of units on screen
    // at once share one InstancedMesh per kind, so this stays a capsule/box regardless of
    // `unitClass`/`buildingClass`; per-instance size variety comes from `transform.scale`, set by
    // `src/rts/syncEntities.ts` (a capsule reads as "unit" at a glance without a per-class mesh).
    case 'RTS_UNIT':
      return new THREE.CapsuleGeometry(radius * 0.45, radius, 4, 8);
    case 'RTS_BUILDING':
      return new THREE.BoxGeometry(radius * 2, radius * 1.4, radius * 2);
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
 * EntityKind (grown by doubling capacity) keeps draw calls flat regardless of entity count.
 */
export class EntityRegistry {
  readonly slots = new Map<string, EntitySlot>();
  private buckets = new Map<EntityKind, InstancedBucket>();
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

  private bucketFor(kind: EntityKind): InstancedBucket {
    let bucket = this.buckets.get(kind);
    if (bucket) return bucket;
    const radius = ENTITY_KIND_RADIUS[kind] || 1;
    const geometry = geometryForKind(kind, radius);
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
    this.buckets.set(kind, bucket);
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
    const bucket = this.bucketFor(entity.kind);
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
    bucket.mesh.setColorAt(index, bucket.baseColor);
    bucket.mesh.instanceMatrix.needsUpdate = true;
    if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    return { entity, kind: entity.kind, mode: 'instanced', index, billboard, lod: false, selected: false };
  }

  move(id: string, transform: Transform): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.entity = { ...slot.entity, transform };
    if (slot.mode === 'instanced' && slot.index !== undefined) {
      const bucket = this.bucketFor(slot.kind);
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
      const bucket = this.bucketFor(slot.kind);
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
      const bucket = this.bucketFor(slot.kind);
      const color = selected ? bucket.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.6) : bucket.baseColor;
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
      const bucket = this.bucketFor(slot.kind);
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
