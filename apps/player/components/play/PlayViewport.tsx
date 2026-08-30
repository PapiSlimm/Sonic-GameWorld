'use client';

import { useEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';
import { SpatialEngine } from '@sonic-gameworld/spatial-engine';
import { quatIdentity, randomUuid, type EntityKind } from '@sonic-gameworld/world-schema';
import type { WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
import {
  EMPTY_KEY_STATE,
  integrateMovement,
  keyToAxis,
  movementVector,
  type KeyState,
  type PlayerPhysicsState,
} from '../../lib/engine/controller';
import { worldBounds2D } from '../../lib/engine/worldHelpers';
import type { PlayerRuntime } from '../../lib/engine/playerRuntime';

const PLAYER_SPEED = 22; // m/s
const CAMERA_PARAMS = { distance: 9, height: 4.5, damping: 6 };
const RUNTIME_PUBLISH_HZ = 12;
const UP_AXIS = new Vector3(0, 1, 0);

/** Yaw (radians, 0 = facing world +Z, matching `@sonic-gameworld/spatial-engine`'s `entityForward`) → a `Quat`. */
function yawToQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  const q = new Quaternion().setFromAxisAngle(UP_AXIS, yaw);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/**
 * Builds the local player's avatar entity, spawned at a world's `PLAYER_SPAWN` location.
 *
 * `docs/CONTRACTS.md` §6's `EntityKind` enum has no dedicated `PLAYER` kind — `PLAYER_SPAWN` (a
 * teal cone primitive, per the engine's `ENTITY_KIND_COLORS`/`geometryForKind`) is the closest
 * fit and doubles as a legible "you are here" marker. It gets its own id distinct from the
 * world's actual spawn-point entity, which is left in place as a fixed marker of where the
 * player entered.
 */
function buildPlayerEntity(ownerId: string, spawn: { x: number; z: number }): WorldEntity {
  return {
    id: randomUuid(),
    kind: 'PLAYER_SPAWN' as EntityKind,
    name: 'Local Player',
    transform: {
      position: { x: spawn.x, y: 0, z: spawn.z },
      rotation: quatIdentity(),
      scale: { x: 1, y: 1, z: 1 },
    },
    tags: ['player', 'local-avatar'],
    permissions: { ownerId, editors: [], visibility: 'PRIVATE' },
    metadata: { isLocalPlayerAvatar: true },
  };
}

export interface PlayViewportProps {
  world: WorldDocument;
  spawn: { x: number; z: number };
  runtime: PlayerRuntime;
  paused?: boolean;
}

/**
 * The GameWorld Play "web runtime" embed (docs/CONTRACTS.md §12): a PLAY-mode
 * `@sonic-gameworld/spatial-engine` `SpatialEngine`, THIRD_PERSON chase camera, and WASD
 * movement. This is the "minimal player controller ... using the engine's public API" the
 * assignment calls for: on mount it `loadWorld()`s the document, `spawn()`s a player entity at
 * the world's `PLAYER_SPAWN`, and every animation frame `move()`s it from keyboard input while
 * the engine's own `ThirdPersonMode` camera handler (tracking that entity) and `tick()` render
 * loop take care of the rest — no `@react-three/fiber` scene of our own.
 *
 * `@sonic-gameworld/spatial-engine`'s React bindings (`/react` subpath: `<SpatialViewport>`)
 * aren't consumed here — see this app's README ("Cross-package notes") for why — so this
 * mounts the framework-agnostic `SpatialEngine` class directly onto a `<canvas>` ref instead.
 * This component is itself loaded through `next/dynamic(..., { ssr: false })` by `PlayClient`,
 * so the engine (WebGL, `window`) is never touched during SSR.
 */
export default function PlayViewport({ world, spawn, runtime, paused = false }: PlayViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const engine = new SpatialEngine({ canvas, width, height, background: '#05070b' });
    engine.loadWorld(world);

    const ownerId = world.passport?.creatorId ?? 'gw-player-local';
    const playerEntity = buildPlayerEntity(ownerId, spawn);
    engine.spawn(playerEntity);
    engine.setCameraMode('THIRD_PERSON', { targetEntityId: playerEntity.id, params: CAMERA_PARAMS });

    const bounds = worldBounds2D(world);
    const keys: KeyState = { ...EMPTY_KEY_STATE };
    let physics: PlayerPhysicsState = { position: { x: spawn.x, z: spawn.z }, yaw: 0 };
    let publishAcc = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const axis = keyToAxis(e.code);
      if (axis) keys[axis] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const axis = keyToAxis(e.code);
      if (axis) keys[axis] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => engine.resize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
    window.addEventListener('resize', onResize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    let rafHandle = 0;
    let last = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const loop = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (!pausedRef.current) {
        const move = movementVector(keys, 0);
        physics = integrateMovement(physics, move, PLAYER_SPEED, dt, bounds);
        engine.move(playerEntity.id, {
          position: { x: physics.position.x, y: 0, z: physics.position.z },
          rotation: yawToQuat(physics.yaw),
          scale: { x: 1, y: 1, z: 1 },
        });

        publishAcc += dt;
        if (publishAcc >= 1 / RUNTIME_PUBLISH_HZ) {
          publishAcc = 0;
          runtime.set(physics.position.x, physics.position.z, physics.yaw);
        }
      }

      engine.tick(dt);
      rafHandle = requestAnimationFrame(loop);
    };
    rafHandle = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafHandle);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      // `SpatialEngine.loadWorld()` keeps the exact `world.entities` array/object references
      // rather than cloning them, so `spawn()` above mutated the same array this component was
      // handed via props/React state. Undo that mutation on teardown (this also keeps repeated
      // mounts — e.g. React StrictMode's dev double-invoke — from accumulating stale avatars).
      engine.remove(playerEntity.id);
      engine.dispose();
    };
    // Re-mounting the engine on every `runtime`/`spawn` object identity change would thrash a
    // WebGL context each render; those are stable per play session (see `PlayClient`), so only
    // the world and the spawn coordinates that matter are tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, spawn.x, spawn.z]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
