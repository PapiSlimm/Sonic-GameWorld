import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CameraModeContext } from '../types.js';
import { OrbitMode } from './orbit.js';
import { FollowMode } from './follow.js';
import { ChaseMode } from './chase.js';
import { DroneMode } from './drone.js';
import { FirstPersonMode } from './firstPerson.js';
import { ThirdPersonMode } from './thirdPerson.js';
import { RailMode } from './rail.js';
import { CraneMode } from './crane.js';
import { AIDirectorMode } from './aiDirector.js';
import { RTSMode } from './rts.js';
import { damp, dampVec3, dampingToLambda } from '../damping.js';
import { interpolateKeyframes } from '../../engine/keyframes.js';
import { transformAt } from '@sonic-gameworld/world-schema';

function makeCtx(overrides: Partial<CameraModeContext> = {}): CameraModeContext {
  return {
    camera: new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 20000),
    targetPosition: new THREE.Vector3(0, 0, 0),
    targetQuaternion: new THREE.Quaternion(),
    targetVelocity: new THREE.Vector3(),
    hasTarget: true,
    params: {},
    keyframes: [],
    dt: 1 / 60,
    elapsed: 0,
    viewportWidth: 800,
    viewportHeight: 600,
    ...overrides,
  };
}

function horizontalDistance(v: THREE.Vector3): number {
  return Math.hypot(v.x, v.z);
}

describe('damping math', () => {
  it('damp() converges toward target and is a no-op for dt<=0', () => {
    expect(damp(0, 10, 5, 0)).toBe(0);
    const stepped = damp(0, 10, 5, 1 / 60);
    expect(stepped).toBeGreaterThan(0);
    expect(stepped).toBeLessThan(10);
    // Large lambda*dt should converge very close to target.
    expect(damp(0, 10, 30, 1)).toBeCloseTo(10, 3);
  });

  it('dampVec3 damps each axis independently', () => {
    const out = new THREE.Vector3(0, 0, 0);
    dampVec3(out, new THREE.Vector3(10, -10, 5), 30, 1);
    expect(out.x).toBeCloseTo(10, 2);
    expect(out.y).toBeCloseTo(-10, 2);
    expect(out.z).toBeCloseTo(5, 2);
  });

  it('dampingToLambda maps 0..1 monotonically to a wider lambda range', () => {
    const loose = dampingToLambda(0);
    const tight = dampingToLambda(1);
    expect(tight).toBeGreaterThan(loose);
    expect(dampingToLambda(undefined, 4)).toBe(4);
  });
});

describe('OrbitMode', () => {
  it('reset() places the camera at (distance, height) from the target and looks at it', () => {
    const mode = new OrbitMode();
    const ctx = makeCtx({ params: { distance: 25, height: 12 } });
    mode.reset(ctx);
    expect(ctx.camera.position.y).toBeCloseTo(12, 5);
    expect(horizontalDistance(ctx.camera.position)).toBeCloseTo(25, 5);
  });

  it('update() advances the orbit angle over time (position changes at a fixed radius)', () => {
    const mode = new OrbitMode();
    const ctx = makeCtx({ params: { distance: 25, height: 12, damping: 1 } });
    mode.reset(ctx);
    const first = ctx.camera.position.clone();
    ctx.dt = 2; // large step so damped position clearly moves
    mode.update(ctx);
    expect(ctx.camera.position.equals(first)).toBe(false);
    expect(horizontalDistance(ctx.camera.position)).toBeCloseTo(25, 1);
  });
});

describe('FollowMode', () => {
  it('sits behind the target opposite its facing direction, offset upward by height', () => {
    const mode = new FollowMode();
    const ctx = makeCtx({ params: { distance: 8, height: 3 }, targetQuaternion: new THREE.Quaternion() });
    mode.reset(ctx);
    // Identity quaternion => forward is +Z, so the camera goes to -Z (behind) and +Y (above).
    expect(ctx.camera.position.x).toBeCloseTo(0, 5);
    expect(ctx.camera.position.y).toBeCloseTo(3, 5);
    expect(ctx.camera.position.z).toBeCloseTo(-8, 5);
  });
});

describe('ChaseMode', () => {
  it('trails the direction of travel (velocity) rather than facing when moving fast', () => {
    const mode = new ChaseMode();
    const ctx = makeCtx({
      params: { distance: 6, height: 2 },
      targetVelocity: new THREE.Vector3(10, 0, 0), // moving fast along +X
    });
    mode.reset(ctx);
    // "behind" = normalized velocity = (1,0,0); desired = target - behind*distance + height
    expect(ctx.camera.position.x).toBeCloseTo(-6, 5);
    expect(ctx.camera.position.y).toBeCloseTo(2, 5);
    expect(ctx.camera.position.z).toBeCloseTo(0, 5);
  });

  it('falls back to facing direction when nearly stationary', () => {
    const mode = new ChaseMode();
    const ctx = makeCtx({
      params: { distance: 6, height: 2 },
      targetVelocity: new THREE.Vector3(0.01, 0, 0), // below the 0.5 m/s threshold
      targetQuaternion: new THREE.Quaternion(), // forward = +Z
    });
    mode.reset(ctx);
    expect(ctx.camera.position.x).toBeCloseTo(0, 5);
    expect(ctx.camera.position.z).toBeCloseTo(-6, 5);
  });
});

describe('DroneMode', () => {
  it('sweeps a wide circle above the target when no keyframes are authored', () => {
    const mode = new DroneMode();
    const ctx = makeCtx({ params: { distance: 250, height: 180 }, elapsed: 0 });
    mode.reset(ctx);
    expect(ctx.camera.position.y).toBeCloseTo(180, 5);
    expect(horizontalDistance(ctx.camera.position)).toBeCloseTo(250, 5);
  });

  it('flies the authored keyframe path when keyframes are present', () => {
    const mode = new DroneMode();
    const keyframes = [
      { t: 0, transform: transformAt(0, 100, 0), fov: 50 },
      { t: 10, transform: transformAt(100, 100, 0), fov: 50 },
    ];
    const ctx = makeCtx({ keyframes, elapsed: 0 });
    mode.reset(ctx);
    expect(ctx.camera.position.x).toBeCloseTo(0, 3);
    expect(ctx.camera.position.y).toBeCloseTo(100, 3);
  });
});

describe('FirstPersonMode', () => {
  it('matches the target orientation exactly and rides at eye height', () => {
    const mode = new FirstPersonMode();
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const ctx = makeCtx({ params: { eyeHeightM: 1.8 } as CameraModeContext['params'], targetQuaternion: quat });
    mode.reset(ctx);
    expect(ctx.camera.position.y).toBeCloseTo(1.8, 5);
    expect(ctx.camera.quaternion.equals(quat)).toBe(true);
  });

  it('position converges to a moving target with near-instant (high-lambda) damping', () => {
    const mode = new FirstPersonMode();
    const ctx = makeCtx({ params: { eyeHeightM: 1.7 } as CameraModeContext['params'], targetPosition: new THREE.Vector3(0, 0, 0) });
    mode.reset(ctx);
    ctx.targetPosition = new THREE.Vector3(5, 0, 5);
    ctx.dt = 1; // large dt relative to lambda=30 => should converge almost fully
    mode.update(ctx);
    expect(ctx.camera.position.x).toBeCloseTo(5, 2);
    expect(ctx.camera.position.z).toBeCloseTo(5, 2);
  });
});

describe('ThirdPersonMode', () => {
  it('offsets to the side (shoulder) as well as behind and above', () => {
    const mode = new ThirdPersonMode();
    const ctx = makeCtx({ params: { distance: 4, height: 1.8, shoulderOffsetM: 0.6 } as CameraModeContext['params'] });
    mode.reset(ctx);
    expect(ctx.camera.position.z).toBeCloseTo(-4, 5);
    expect(ctx.camera.position.y).toBeCloseTo(1.8, 5);
    expect(Math.abs(ctx.camera.position.x)).toBeCloseTo(0.6, 5);
  });
});

describe('RailMode', () => {
  it('follows interpolateKeyframes exactly at a given elapsed time', () => {
    const mode = new RailMode();
    const keyframes = [
      { t: 0, transform: transformAt(0, 10, 0), fov: 50 },
      { t: 4, transform: transformAt(40, 10, 0), fov: 50 },
    ];
    const ctx = makeCtx({ keyframes, elapsed: 2, hasTarget: false });
    mode.update(ctx);
    const expected = interpolateKeyframes(keyframes, 2, true)!;
    expect(ctx.camera.position.x).toBeCloseTo(expected.position.x, 5);
    expect(ctx.camera.position.y).toBeCloseTo(expected.position.y, 5);
  });

  it('holds a static shot at the target when no keyframes are authored', () => {
    const mode = new RailMode();
    const ctx = makeCtx({ params: { distance: 20, height: 10 }, keyframes: [] });
    mode.update(ctx);
    expect(ctx.camera.position.y).toBeCloseTo(10, 5);
    expect(ctx.camera.position.z).toBeCloseTo(20, 5);
  });
});

describe('CraneMode', () => {
  it('rises from near ground level toward the configured height as elapsed increases', () => {
    const mode = new CraneMode();
    const early = makeCtx({ params: { distance: 15, height: 20, riseDurationS: 5 } as CameraModeContext['params'], elapsed: 0 });
    mode.reset(early);
    const earlyHeight = early.camera.position.y;

    const late = makeCtx({ params: { distance: 15, height: 20, riseDurationS: 5 } as CameraModeContext['params'], elapsed: 5 });
    late.camera.position.set(0, 0, 0);
    mode.reset(late);
    const lateHeight = late.camera.position.y;

    expect(lateHeight).toBeGreaterThan(earlyHeight);
    expect(lateHeight).toBeCloseTo(20, 1);
  });
});

describe('RTSMode', () => {
  it('reset() looks straight down at a fixed pitch above the anchor, at the configured distance', () => {
    const mode = new RTSMode();
    const ctx = makeCtx({ params: { distance: 100, pitchDeg: 90 } as CameraModeContext['params'], hasTarget: false });
    mode.reset(ctx);
    // pitch=90 => straight overhead: all "distance" becomes height, zero horizontal offset.
    expect(ctx.camera.position.y).toBeCloseTo(100, 4);
    expect(horizontalDistance(ctx.camera.position)).toBeCloseTo(0, 4);
  });

  it('reset() seeds the anchor from the tracked entity, when one is provided', () => {
    const mode = new RTSMode();
    const ctx = makeCtx({ params: { distance: 50, pitchDeg: 60 } as CameraModeContext['params'], targetPosition: new THREE.Vector3(200, 0, -300), hasTarget: true });
    mode.reset(ctx);
    expect(mode.getAnchor().x).toBeCloseTo(200, 5);
    expect(mode.getAnchor().z).toBeCloseTo(-300, 5);
  });

  it('pan() moves the anchor independently of any tracked entity, and the camera follows on update()', () => {
    const mode = new RTSMode();
    const ctx = makeCtx({ params: { distance: 100, pitchDeg: 90, damping: 1 } as CameraModeContext['params'], hasTarget: false });
    mode.reset(ctx);
    mode.pan(50, -20);
    expect(mode.getAnchor()).toEqual({ x: 50, z: -20 });
    ctx.dt = 5; // large step so damping clearly converges
    mode.update(ctx);
    expect(ctx.camera.position.x).toBeCloseTo(50, 1);
    expect(ctx.camera.position.z).toBeCloseTo(-20, 1);
  });

  it('jumpTo() snaps the anchor directly (minimap click-to-jump)', () => {
    const mode = new RTSMode();
    mode.jumpTo(1000, -500);
    expect(mode.getAnchor()).toEqual({ x: 1000, z: -500 });
  });

  it('zoom() clamps distance to [minDistanceM, maxDistanceM]', () => {
    const mode = new RTSMode(100);
    const ctx = makeCtx({ params: { minDistanceM: 40, maxDistanceM: 200 } as CameraModeContext['params'] });
    mode.zoom(1000, ctx);
    expect(mode.getDistance()).toBe(200);
    mode.zoom(-1000, ctx);
    expect(mode.getDistance()).toBe(40);
  });

  it('does not orbit/rotate — the camera keeps the same yaw as the anchor changes over time', () => {
    const mode = new RTSMode();
    const ctx = makeCtx({ params: { distance: 100, pitchDeg: 60 } as CameraModeContext['params'], hasTarget: false, elapsed: 0 });
    mode.reset(ctx);
    const first = ctx.camera.position.clone();
    ctx.elapsed = 50; // a mode that auto-orbits (like OrbitMode) would visibly rotate by now
    mode.update(ctx);
    // No pan/zoom happened — position should be unchanged (within damping's convergence to the same target).
    expect(ctx.camera.position.x).toBeCloseTo(first.x, 5);
    expect(ctx.camera.position.z).toBeCloseTo(first.z, 5);
  });
});

describe('AIDirectorMode', () => {
  it('widens distance from the target when the target is moving fast (more breathing room)', () => {
    const mode = new AIDirectorMode();
    const calm = makeCtx({ params: { distance: 14, height: 6 }, targetVelocity: new THREE.Vector3(0, 0, 0) });
    mode.reset(calm);
    const calmDistance = horizontalDistance(calm.camera.position);

    const excited = new AIDirectorMode();
    const fast = makeCtx({ params: { distance: 14, height: 6 }, targetVelocity: new THREE.Vector3(20, 0, 0) });
    excited.reset(fast);
    const fastDistance = horizontalDistance(fast.camera.position);

    expect(fastDistance).toBeGreaterThan(calmDistance);
  });
});
