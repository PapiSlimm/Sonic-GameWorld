import * as THREE from 'three';
import type { WorldEnvironment } from '@sonic-gameworld/world-schema';

interface ColorStop {
  t: number;
  color: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
}

// Sky gradient over a 24h cycle. Matches the command-center dark aesthetic at night (`#05070B`).
const SKY_STOPS: ColorStop[] = [
  { t: 0, color: new THREE.Color('#05070B'), sunIntensity: 0.05, ambientIntensity: 0.15 },
  { t: 5, color: new THREE.Color('#0d1a33'), sunIntensity: 0.1, ambientIntensity: 0.2 },
  { t: 6.5, color: new THREE.Color('#ff9d5c'), sunIntensity: 0.9, ambientIntensity: 0.4 },
  { t: 8, color: new THREE.Color('#7fb8ff'), sunIntensity: 1.3, ambientIntensity: 0.55 },
  { t: 12, color: new THREE.Color('#bfe3ff'), sunIntensity: 1.6, ambientIntensity: 0.65 },
  { t: 17, color: new THREE.Color('#ffb066'), sunIntensity: 1.1, ambientIntensity: 0.5 },
  { t: 19, color: new THREE.Color('#3b2960'), sunIntensity: 0.4, ambientIntensity: 0.3 },
  { t: 21, color: new THREE.Color('#0d1120'), sunIntensity: 0.1, ambientIntensity: 0.2 },
  { t: 24, color: new THREE.Color('#05070B'), sunIntensity: 0.05, ambientIntensity: 0.15 },
];

export function skyForTimeOfDay(timeOfDay: number): { color: THREE.Color; sunIntensity: number; ambientIntensity: number } {
  const t = ((timeOfDay % 24) + 24) % 24;
  let a = SKY_STOPS[0]!;
  let b = SKY_STOPS[SKY_STOPS.length - 1]!;
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const cur = SKY_STOPS[i]!;
    const next = SKY_STOPS[i + 1]!;
    if (t >= cur.t && t <= next.t) {
      a = cur;
      b = next;
      break;
    }
  }
  const span = Math.max(b.t - a.t, 1e-6);
  const alpha = Math.min(Math.max((t - a.t) / span, 0), 1);
  return {
    color: a.color.clone().lerp(b.color, alpha),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * alpha,
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * alpha,
  };
}

/** Weather kinds that spawn a particle system. CLEAR/CLOUDS/FOG only affect sky/fog, not particles. */
const PARTICLE_WEATHERS: WorldEnvironment['weather'][] = ['RAIN', 'STORM', 'SNOW', 'SANDSTORM'];

interface ParticleConfig {
  color: number;
  size: number;
  count: number;
  velocity: THREE.Vector3;
  jitter: number;
}

function particleConfigFor(weather: WorldEnvironment['weather'], intensity: number): ParticleConfig | null {
  const i = Math.max(0.1, intensity);
  switch (weather) {
    case 'RAIN':
      return { color: 0x8fb3d9, size: 0.15, count: Math.round(1200 * i), velocity: new THREE.Vector3(0, -28, 0), jitter: 0.5 };
    case 'STORM':
      return { color: 0xaac4e6, size: 0.18, count: Math.round(2200 * i), velocity: new THREE.Vector3(-4, -40, 0), jitter: 1.5 };
    case 'SNOW':
      return { color: 0xffffff, size: 0.28, count: Math.round(900 * i), velocity: new THREE.Vector3(0.3, -2.2, 0), jitter: 0.8 };
    case 'SANDSTORM':
      return { color: 0xd8b878, size: 0.22, count: Math.round(1600 * i), velocity: new THREE.Vector3(-14, -0.4, 2), jitter: 2.5 };
    default:
      return null;
  }
}

/**
 * Sky color / lighting driven by `timeOfDay`, fog, and a lightweight GPU-friendly particle system for
 * RAIN / SNOW / STORM / SANDSTORM (CLEAR / CLOUDS / FOG have no particles). Particles fall/drift inside
 * a box centered on the camera and wrap around, so a fixed particle count reads as endless weather.
 */
export class EnvironmentController {
  private scene: THREE.Scene;
  private group: THREE.Group;
  readonly ambient: THREE.AmbientLight;
  readonly sun: THREE.DirectionalLight;
  private particles: THREE.Points | null = null;
  private velocities: Float32Array | null = null;
  private jitter = 0;
  private bounds = 120;
  private env: WorldEnvironment = { timeOfDay: 12, weather: 'CLEAR', weatherIntensity: 0, gravity: -9.81 };

  constructor(scene: THREE.Scene, group: THREE.Group) {
    this.scene = scene;
    this.group = group;
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.position.set(120, 200, 80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.far = 2000;
    this.group.add(this.ambient, this.sun);
  }

  getEnvironment(): WorldEnvironment {
    return this.env;
  }

  setEnvironment(env: WorldEnvironment): void {
    this.env = env;
    this.applySky();
    this.applyFog();
    this.applyWeather();
  }

  private applySky(): void {
    const sky = skyForTimeOfDay(this.env.timeOfDay);
    this.scene.background = sky.color;
    this.ambient.intensity = sky.ambientIntensity;
    this.sun.intensity = sky.sunIntensity;
    const angle = ((this.env.timeOfDay - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(angle) * 300, Math.max(30, Math.sin(angle) * 300), 150);
    this.sun.color.copy(sky.color).lerp(new THREE.Color(0xffffff), 0.5);
  }

  private applyFog(): void {
    if (this.env.fog) {
      this.scene.fog = new THREE.FogExp2(new THREE.Color(this.env.fog.color), this.env.fog.density);
      return;
    }
    const hazyWeather = this.env.weather === 'FOG' || this.env.weather === 'SANDSTORM' || this.env.weather === 'STORM';
    if (hazyWeather) {
      const sky = skyForTimeOfDay(this.env.timeOfDay);
      const density = this.env.weather === 'FOG' ? 0.02 : 0.008 + this.env.weatherIntensity * 0.02;
      this.scene.fog = new THREE.FogExp2(sky.color, density);
    } else {
      this.scene.fog = null;
    }
  }

  private disposeParticles(): void {
    if (this.particles) {
      this.group.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.particles = null;
      this.velocities = null;
    }
  }

  private applyWeather(): void {
    this.disposeParticles();
    if (!PARTICLE_WEATHERS.includes(this.env.weather)) return;
    const config = particleConfigFor(this.env.weather, this.env.weatherIntensity);
    if (!config) return;
    this.jitter = config.jitter;
    const positions = new Float32Array(config.count * 3);
    const velocities = new Float32Array(config.count * 3);
    for (let i = 0; i < config.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.bounds * 2;
      positions[i * 3 + 1] = Math.random() * this.bounds;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.bounds * 2;
      velocities[i * 3] = config.velocity.x;
      velocities[i * 3 + 1] = config.velocity.y;
      velocities[i * 3 + 2] = config.velocity.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: config.color,
      size: config.size,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geometry, material);
    this.velocities = velocities;
    this.group.add(this.particles);
  }

  /** Advances particles and re-centers the weather volume on `focus` (usually the camera) so it never runs dry. */
  tick(dt: number, focus: THREE.Vector3): void {
    if (!this.particles || !this.velocities) return;
    const posAttr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i] ?? 0) + (this.velocities[i] ?? 0) * dt + (Math.random() - 0.5) * this.jitter * dt;
      arr[i + 1] = (arr[i + 1] ?? 0) + (this.velocities[i + 1] ?? 0) * dt;
      arr[i + 2] = (arr[i + 2] ?? 0) + (this.velocities[i + 2] ?? 0) * dt + (Math.random() - 0.5) * this.jitter * dt;

      if ((arr[i + 1] ?? 0) < -5) arr[i + 1] = this.bounds;
      const dx = (arr[i] ?? 0) - focus.x;
      const dz = (arr[i + 2] ?? 0) - focus.z;
      if (Math.abs(dx) > this.bounds) arr[i] = focus.x - Math.sign(dx) * this.bounds;
      if (Math.abs(dz) > this.bounds) arr[i + 2] = focus.z - Math.sign(dz) * this.bounds;
    }
    posAttr.needsUpdate = true;
    this.particles.position.set(0, 0, 0);
  }

  dispose(): void {
    this.disposeParticles();
    this.group.remove(this.ambient, this.sun);
  }
}
