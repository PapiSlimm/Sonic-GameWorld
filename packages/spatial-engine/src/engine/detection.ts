import * as THREE from 'three';
import type { WorldEntity } from '@sonic-gameworld/world-schema';

const OVERLAY_KINDS: WorldEntity['kind'][] = ['NPC', 'VEHICLE', 'TRIGGER'];

function detectionRadiusFor(entity: WorldEntity): number {
  const fromMeta = entity.metadata['detectionRadiusM'];
  if (typeof fromMeta === 'number') return fromMeta;
  if (entity.kind === 'TRIGGER') return 10;
  if (entity.kind === 'VEHICLE') return 20;
  return 12;
}

function aggressionColorFor(entity: WorldEntity): number {
  const aggression = (entity.behavior?.params['aggression'] as number | undefined) ?? 0;
  // calm -> teal accent, hostile -> danger red (matches the UI token palette in §12)
  return aggression > 0.6 ? 0xff4d6d : aggression > 0.25 ? 0xffb020 : 0x38f5c8;
}

/** A flat ring (radius = detection distance) laid on the ground plane, colored by faction aggression. */
function makeRing(): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.94, 1, 48);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x38f5c8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

/** A forward-facing sensor cone/wedge (a shallow cone whose tip sits at the entity, base pointing "forward"). */
function makeCone(): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(1, 1, 16, 1, true);
  geometry.rotateX(Math.PI / 2); // tip now points along +Z ("forward")
  geometry.translate(0, 0, 0.5);
  const material = new THREE.MeshBasicMaterial({ color: 0x38f5c8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

/**
 * Detection overlay rings (DETECTION layer) + sensor cones (SENSORS layer) for NPC / VEHICLE / TRIGGER
 * entities. Purely visual metadata — radii come from `entity.metadata.detectionRadiusM` (falls back to
 * a sane per-kind default) so authored worlds can tune them without engine changes.
 */
export class DetectionOverlay {
  private rings = new Map<string, THREE.Mesh>();
  private cones = new Map<string, THREE.Mesh>();

  constructor(
    private detectionGroup: THREE.Group,
    private sensorGroup: THREE.Group,
  ) {}

  sync(entity: WorldEntity): void {
    if (!OVERLAY_KINDS.includes(entity.kind)) {
      this.remove(entity.id);
      return;
    }
    const radius = detectionRadiusFor(entity);
    const color = aggressionColorFor(entity);
    const { x, y, z } = entity.transform.position;
    const { x: qx, y: qy, z: qz, w: qw } = entity.transform.rotation;

    let ring = this.rings.get(entity.id);
    if (!ring) {
      ring = makeRing();
      this.rings.set(entity.id, ring);
      this.detectionGroup.add(ring);
    }
    ring.position.set(x, y + 0.05, z);
    ring.scale.set(radius, 1, radius);
    (ring.material as THREE.MeshBasicMaterial).color.setHex(color);

    let cone = this.cones.get(entity.id);
    if (!cone) {
      cone = makeCone();
      this.cones.set(entity.id, cone);
      this.sensorGroup.add(cone);
    }
    cone.position.set(x, y + 0.5, z);
    cone.quaternion.set(qx, qy, qz, qw);
    cone.scale.set(radius * 0.5, radius * 0.5, radius * 0.9);
    (cone.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  remove(id: string): void {
    const ring = this.rings.get(id);
    if (ring) {
      this.detectionGroup.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      this.rings.delete(id);
    }
    const cone = this.cones.get(id);
    if (cone) {
      this.sensorGroup.remove(cone);
      cone.geometry.dispose();
      (cone.material as THREE.Material).dispose();
      this.cones.delete(id);
    }
  }

  dispose(): void {
    for (const id of Array.from(this.rings.keys())) this.remove(id);
  }
}
