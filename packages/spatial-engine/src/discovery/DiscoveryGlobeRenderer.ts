import * as THREE from 'three';
import type { ProductCategory } from '@sonic-gameworld/world-schema';
import { createRenderer, type CreateRendererOptions } from '../engine/renderer.js';
import type { RendererLike } from '../types.js';
import type { DiscoveryGraph, DiscoveryNode } from './buildDiscoveryGraph.js';

/** Palette drawn from the §12 UI tokens (accent/accent2/warn/danger) extended for 10 categories. */
const CATEGORY_COLORS: Record<ProductCategory, number> = {
  WORLD: 0x38f5c8,
  GAME_KIT: 0x7c5cff,
  SYSTEM: 0x38a6f5,
  AI_AGENT: 0xffb020,
  CHARACTER: 0xff4d6d,
  VEHICLE: 0xf538c8,
  ENVIRONMENT: 0x8fe388,
  CINEMATIC: 0xe6c068,
  MISSION: 0x68a0e6,
  EXPERIENCE: 0xcccccc,
};

export interface DiscoveryGlobeOptions extends CreateRendererOptions {
  background?: string | number;
}

/**
 * Framework-agnostic renderer for the marketplace discovery globe: a wireframe sphere with product
 * nodes (from `buildDiscoveryGraph`) as colored instanced spheres, connected by faint category-ring
 * edges. The React `<DiscoveryGlobe>` wraps this the same way `SpatialViewport` wraps `SpatialEngine`.
 */
export class DiscoveryGlobeRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly globeGroup = new THREE.Group();

  private renderer: RendererLike;
  private nodesMesh: THREE.InstancedMesh | null = null;
  private lines: THREE.LineSegments | null = null;
  private raycaster = new THREE.Raycaster();
  private graph: DiscoveryGraph = { nodes: [], edges: [], radius: 100 };
  private width: number;
  private height: number;
  autoRotateSpeed = 0.06;

  constructor(opts: DiscoveryGlobeOptions = {}) {
    this.width = opts.width ?? 600;
    this.height = opts.height ?? 600;
    this.renderer = createRenderer({ ...opts, width: this.width, height: this.height });
    this.scene.background = new THREE.Color(opts.background ?? '#05070B');
    this.camera = new THREE.PerspectiveCamera(50, this.width / Math.max(this.height, 1), 0.1, 5000);
    this.camera.position.set(0, 0, 280);
    this.scene.add(this.globeGroup);

    const wireGeometry = new THREE.SphereGeometry(98, 24, 16);
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x1b2230, wireframe: true, transparent: true, opacity: 0.5 });
    this.globeGroup.add(new THREE.Mesh(wireGeometry, wireMaterial));
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
  }

  setGraph(graph: DiscoveryGraph): void {
    this.graph = graph;
    this.rebuild();
  }

  getGraph(): DiscoveryGraph {
    return this.graph;
  }

  private rebuild(): void {
    if (this.nodesMesh) {
      this.globeGroup.remove(this.nodesMesh);
      this.nodesMesh.geometry.dispose();
      (this.nodesMesh.material as THREE.Material).dispose();
      this.nodesMesh = null;
    }
    if (this.lines) {
      this.globeGroup.remove(this.lines);
      this.lines.geometry.dispose();
      (this.lines.material as THREE.Material).dispose();
      this.lines = null;
    }
    if (this.graph.nodes.length === 0) return;

    const geometry = new THREE.SphereGeometry(1.6, 12, 10);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    const mesh = new THREE.InstancedMesh(geometry, material, this.graph.nodes.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    this.graph.nodes.forEach((n, i) => {
      matrix.compose(
        new THREE.Vector3(n.position.x, n.position.y, n.position.z),
        new THREE.Quaternion(),
        new THREE.Vector3(n.size, n.size, n.size),
      );
      mesh.setMatrixAt(i, matrix);
      color.set(CATEGORY_COLORS[n.category] ?? 0xffffff);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.nodesMesh = mesh;
    this.globeGroup.add(mesh);

    if (this.graph.edges.length > 0) {
      const byId = new Map(this.graph.nodes.map((n) => [n.id, n] as const));
      const positions = new Float32Array(this.graph.edges.length * 6);
      this.graph.edges.forEach((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return;
        positions[i * 6] = a.position.x;
        positions[i * 6 + 1] = a.position.y;
        positions[i * 6 + 2] = a.position.z;
        positions[i * 6 + 3] = b.position.x;
        positions[i * 6 + 4] = b.position.y;
        positions[i * 6 + 5] = b.position.z;
      });
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x38f5c8, transparent: true, opacity: 0.3 });
      this.lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      this.globeGroup.add(this.lines);
    }
  }

  rotateBy(deltaX: number, deltaY: number): void {
    this.globeGroup.rotation.y += deltaX;
    this.globeGroup.rotation.x = Math.max(-1.2, Math.min(1.2, this.globeGroup.rotation.x + deltaY));
  }

  tick(dt: number, autoRotate = true): void {
    if (autoRotate) this.globeGroup.rotation.y += this.autoRotateSpeed * dt;
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / Math.max(this.height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Returns the node under normalized-device-coordinates `ndc` (each in [-1, 1]), or null. */
  hitTest(ndc: { x: number; y: number }): DiscoveryNode | null {
    if (!this.nodesMesh) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const hits = this.raycaster.intersectObject(this.nodesMesh);
    const hit = hits[0];
    if (hit && hit.instanceId !== undefined) return this.graph.nodes[hit.instanceId] ?? null;
    return null;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
