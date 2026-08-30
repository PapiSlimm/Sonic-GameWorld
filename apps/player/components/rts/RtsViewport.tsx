'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  SpatialEngine,
  parseRTSEntityId,
  rtsUnitEntityId,
  type RTSMode,
  type CameraModeContext,
} from '@sonic-gameworld/spatial-engine';
import { createEmptyWorld } from '@sonic-gameworld/world-schema';
import { useRtsStore } from '../../lib/rts/store';
import { buildAttackCommand, buildMoveCommand } from '../../lib/rts/commands';
import { isMarqueeDrag, unitsInMarquee, type ScreenRect } from '../../lib/rts/selection';
import type { RtsViewportRuntime, UnitScreenMarker } from '../../lib/rts/viewportRuntime';
import { FEEDBACK_MAX_AGE_MS } from './RtsUnitOverlay';

const RTS_CAMERA_PARAMS = { distance: 170, damping: 6, pitchDeg: 58, minDistanceM: 45, maxDistanceM: 420 };
const POSSESS_PARAMS = { distance: 9, height: 4.5, damping: 6 };
const PAN_EDGE_PX = 26;
const PAN_SPEED_FACTOR = 0.65; // meters/second of pan per meter of current zoom distance
const ZOOM_SPEED = 0.12; // meters of zoom per wheel-delta unit
const OFFSCREEN_MARGIN_PX = 60;

/** Builds a minimal `CameraModeContext` good enough for `RTSMode.zoom()`, which only reads
 * `ctx.params` — see that class's `bounds()`. The other fields are unused by `zoom()` today; kept
 * as real (if inert) values rather than `as any` so a future change to `zoom()` fails loudly at
 * the type level instead of silently reading garbage. */
function buildZoomContext(camera: THREE.PerspectiveCamera, params: typeof RTS_CAMERA_PARAMS, width: number, height: number): CameraModeContext {
  return {
    camera,
    targetPosition: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(),
    targetVelocity: new THREE.Vector3(),
    hasTarget: false,
    params,
    keyframes: [],
    dt: 0,
    elapsed: 0,
    viewportWidth: width,
    viewportHeight: height,
  };
}

function projectToScreen(pos: { x: number; y: number; z: number }, camera: THREE.PerspectiveCamera, width: number, height: number): { x: number; y: number } | null {
  const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(camera);
  if (v.z < -1 || v.z > 1) return null; // behind the camera or beyond the far plane
  const sx = (v.x * 0.5 + 0.5) * width;
  const sy = (1 - (v.y * 0.5 + 0.5)) * height;
  if (sx < -OFFSCREEN_MARGIN_PX || sx > width + OFFSCREEN_MARGIN_PX || sy < -OFFSCREEN_MARGIN_PX || sy > height + OFFSCREEN_MARGIN_PX) return null;
  return { x: sx, y: sy };
}

export interface RtsViewportProps {
  mapWidthM: number;
  mapDepthM: number;
  ownerId: string;
  runtime: RtsViewportRuntime;
}

/**
 * The RTS 3D canvas (docs/RTS-CONTRACTS.md §7): owns the `SpatialEngine` instance, drives
 * `useRtsStore.getState().advance(dt)` on a `requestAnimationFrame` loop (the store internally
 * fixed-steps `tickMatch()`), mirrors the resulting `RTSMatchState` onto the engine every frame via
 * `syncRTSEntities()`, and turns mouse/keyboard input into selection state and `RTSCommand`s.
 *
 * Reads the live match from `useRtsStore.getState()` inside the RAF loop rather than a React prop
 * — match state changes every tick (10Hz), and routing it through React would mean a full
 * re-render at that cadence for a canvas that doesn't need React to re-render at all (mirrors
 * `PlayViewport.tsx`'s same reasoning for its own runtime state).
 *
 * Possession is store-driven rather than an imperative ref/handle: `RtsHud`'s possess/release
 * button (and this component's own Escape handler) only ever write `useRtsStore`'s
 * `possessedUnitId` field — the RAF loop below is the single place that diffs that field against
 * what the engine currently has possessed and calls `SpatialEngine.possessEntity()`/
 * `releasePossession()` to match. That keeps every RTS component reachable through
 * `next/dynamic(..., { ssr: false })` without needing ref-forwarding through it, and matches
 * `lib/rts/store.ts`'s documented "store decides, component executes" split.
 */
export function RtsViewport({ mapWidthM, mapDepthM, ownerId, runtime }: RtsViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const engine = new SpatialEngine({ canvas, width, height, background: '#05070b' });

    const doc = createEmptyWorld({
      name: 'RTS Arena',
      ownerId,
      halfExtentM: Math.max(mapWidthM, mapDepthM) / 2,
    });
    engine.loadWorld(doc);
    engine.setCameraMode('RTS', { params: RTS_CAMERA_PARAMS });
    const rtsMode = engine.cameraController.getModeHandler<RTSMode>('RTS');
    rtsMode.jumpTo(mapWidthM / 2, mapDepthM / 2);

    const groundRaycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    function ndcFromEvent(e: MouseEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -(((e.clientY - rect.top) / rect.height) * 2 - 1) };
    }
    function localFromEvent(e: MouseEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function intersectGround(ndc: { x: number; y: number }): THREE.Vector3 | null {
      groundRaycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), engine.cameraController.camera);
      const out = new THREE.Vector3();
      return groundRaycaster.ray.intersectPlane(groundPlane, out) ? out : null;
    }

    // ---- selection (click + marquee drag) ----
    let dragStart: { x: number; y: number } | null = null;
    let dragging = false;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      dragStart = localFromEvent(e);
      dragging = false;
    }
    function onPointerMove(e: PointerEvent) {
      lastMouseLocal = localFromEvent(e);
      if (!dragStart) return;
      const current = lastMouseLocal;
      if (!dragging && isMarqueeDrag(dragStart, current)) dragging = true;
      if (dragging) setMarquee({ x0: dragStart.x, y0: dragStart.y, x1: current.x, y1: current.y });
    }
    function onPointerUp(e: PointerEvent) {
      if (e.button !== 0 || !dragStart) return;
      const localFactionId = useRtsStore.getState().localFactionId;
      const end = localFromEvent(e);
      if (dragging && localFactionId) {
        const rect: ScreenRect = { x0: dragStart.x, y0: dragStart.y, x1: end.x, y1: end.y };
        const candidates = runtime
          .getSnapshot()
          .unitMarkers.filter((m): m is UnitScreenMarker & { screen: { x: number; y: number } } => m.screen !== null);
        useRtsStore.getState().selectUnits(unitsInMarquee(candidates, rect, localFactionId));
      } else if (!dragging) {
        const hit = engine.raycast(ndcFromEvent(e));
        const parsed = hit ? parseRTSEntityId(hit.entityId) : null;
        const match = useRtsStore.getState().match;
        const unit = parsed?.kind === 'unit' && match ? match.entities.units.find((u) => u.id === parsed.id) : undefined;
        useRtsStore.getState().selectUnits(unit && localFactionId && unit.factionId === localFactionId ? [unit.id] : []);
      }
      dragStart = null;
      dragging = false;
      setMarquee(null);
    }

    // ---- move / attack-move (right-click) ----
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      const { selectedUnitIds, localFactionId, match } = useRtsStore.getState();
      if (!match || !localFactionId || selectedUnitIds.length === 0) return;

      const ndc = ndcFromEvent(e);
      const clickScreen = localFromEvent(e);
      const hit = engine.raycast(ndc);
      const parsed = hit ? parseRTSEntityId(hit.entityId) : null;

      let enemyTargetId: string | null = null;
      if (parsed?.kind === 'unit') {
        const target = match.entities.units.find((u) => u.id === parsed.id);
        if (target && target.factionId !== localFactionId) enemyTargetId = target.id;
      } else if (parsed?.kind === 'building') {
        const target = match.entities.buildings.find((b) => b.id === parsed.id);
        if (target && target.factionId !== localFactionId) enemyTargetId = target.id;
      }

      if (enemyTargetId) {
        useRtsStore.getState().issueCommand(buildAttackCommand(selectedUnitIds, enemyTargetId));
        runtime.addFeedbackMarker({ kind: 'ATTACK_MOVE', screen: clickScreen, createdAtMs: Date.now() });
        return;
      }

      const ground = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : intersectGround(ndc);
      if (!ground) return;
      useRtsStore.getState().issueCommand(buildMoveCommand(selectedUnitIds, { x: ground.x, y: 0, z: ground.z }));
      runtime.addFeedbackMarker({ kind: 'MOVE', screen: clickScreen, createdAtMs: Date.now() });
    }

    // ---- zoom (scroll wheel) ----
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      rtsMode.zoom(e.deltaY * ZOOM_SPEED, buildZoomContext(engine.cameraController.camera, RTS_CAMERA_PARAMS, container!.clientWidth, container!.clientHeight));
    }

    // ---- edge-pan (mouse near the viewport edge) ----
    let lastMouseLocal: { x: number; y: number } | null = null;
    function onMouseLeave() {
      lastMouseLocal = null;
    }

    // ---- Escape: documented way back to the RTS overview camera (docs/RTS-CONTRACTS.md §7) ----
    // Only updates the store's intent — the RAF loop below is what actually calls
    // `engine.releasePossession()`, keeping a single place responsible for applying possession.
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape' && useRtsStore.getState().possessedUnitId !== null) {
        useRtsStore.getState().possess(null);
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('keydown', onKeyDown);

    const onResize = () => engine.resize(Math.max(container!.clientWidth, 1), Math.max(container!.clientHeight, 1));
    window.addEventListener('resize', onResize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    let rafHandle = 0;
    let last = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let appliedPossessedUnitId: string | null = null;

    const loop = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Apply the store's possession intent to the engine (see this component's doc comment on
      // why possession is store-driven rather than an imperative ref/handle).
      const wantPossessed = useRtsStore.getState().possessedUnitId;
      if (wantPossessed !== appliedPossessedUnitId) {
        if (wantPossessed) engine.possessEntity(rtsUnitEntityId(wantPossessed), 'THIRD_PERSON', POSSESS_PARAMS);
        else engine.releasePossession();
        appliedPossessedUnitId = wantPossessed;
      }

      // Minimap "click to recenter" (§7) — see `RtsViewportRuntime.requestJumpTo`'s doc comment.
      const jumpTo = runtime.consumeJumpToRequest();
      if (jumpTo) rtsMode.jumpTo(jumpTo.x, jumpTo.z);

      // Edge-pan, scaled by the current zoom distance so it feels consistent at any zoom level.
      if (lastMouseLocal && !engine.isPossessing()) {
        const w = container!.clientWidth;
        const h = container!.clientHeight;
        const speed = rtsMode.getDistance() * PAN_SPEED_FACTOR * dt;
        let dx = 0;
        let dz = 0;
        if (lastMouseLocal.x < PAN_EDGE_PX) dx -= speed;
        else if (lastMouseLocal.x > w - PAN_EDGE_PX) dx += speed;
        if (lastMouseLocal.y < PAN_EDGE_PX) dz -= speed;
        else if (lastMouseLocal.y > h - PAN_EDGE_PX) dz += speed;
        if (dx !== 0 || dz !== 0) rtsMode.pan(dx, dz);
      }

      if (!engine.isPossessing()) useRtsStore.getState().advance(dt);
      const match = useRtsStore.getState().match;

      if (match) {
        engine.syncRTSEntities(match);
        const camera = engine.cameraController.camera;
        const w = container!.clientWidth;
        const h = container!.clientHeight;
        const selected = new Set(useRtsStore.getState().selectedUnitIds);
        const markers: UnitScreenMarker[] = match.entities.units
          .filter((u) => u.state !== 'DEAD')
          .map((u) => ({
            id: u.id,
            factionId: u.factionId,
            unitClass: u.unitClass,
            screen: projectToScreen(u.transform.position, camera, w, h),
            health: u.health,
            maxHealth: u.maxHealth,
            isSelected: selected.has(u.id),
          }));
        runtime.setUnitMarkers(markers);
      }

      runtime.setCamera({ anchor: rtsMode.getAnchor(), distanceM: rtsMode.getDistance() });
      runtime.pruneFeedbackMarkers(Date.now(), FEEDBACK_MAX_AGE_MS);

      engine.tick(dt);
      rafHandle = requestAnimationFrame(loop);
    };
    rafHandle = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafHandle);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapWidthM, mapDepthM, ownerId, runtime]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair touch-none" />
      {marquee && (
        <div
          className="pointer-events-none absolute border border-accent/80 bg-accent/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
    </div>
  );
}

export default RtsViewport;
