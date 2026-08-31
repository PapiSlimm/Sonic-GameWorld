import { describe, expect, it, vi } from 'vitest';
import { createRtsViewportRuntime } from './viewportRuntime';

describe('createRtsViewportRuntime', () => {
  it('starts empty', () => {
    const runtime = createRtsViewportRuntime();
    expect(runtime.getSnapshot()).toEqual({ unitMarkers: [], feedbackMarkers: [], camera: null });
  });

  it('setUnitMarkers replaces the marker list and notifies subscribers', () => {
    const runtime = createRtsViewportRuntime();
    const onChange = vi.fn();
    runtime.subscribe(onChange);

    const markers = [
      { id: 'u1', factionId: 'raven-alliance', unitClass: 'INFANTRY', screen: { x: 1, y: 2 }, health: 80, maxHealth: 100, isSelected: true, heat: 0.2, isThermallyDetected: false },
    ];
    runtime.setUnitMarkers(markers);

    expect(runtime.getSnapshot().unitMarkers).toEqual(markers);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('addFeedbackMarker assigns a unique id and appends without clobbering existing markers', () => {
    const runtime = createRtsViewportRuntime();
    runtime.addFeedbackMarker({ kind: 'MOVE', screen: { x: 10, y: 10 }, createdAtMs: 0 });
    runtime.addFeedbackMarker({ kind: 'ATTACK_MOVE', screen: { x: 20, y: 20 }, createdAtMs: 5 });

    const markers = runtime.getSnapshot().feedbackMarkers;
    expect(markers).toHaveLength(2);
    expect(new Set(markers.map((m) => m.id)).size).toBe(2);
  });

  it('pruneFeedbackMarkers drops only markers older than maxAgeMs', () => {
    const runtime = createRtsViewportRuntime();
    runtime.addFeedbackMarker({ kind: 'MOVE', screen: { x: 0, y: 0 }, createdAtMs: 0 });
    runtime.addFeedbackMarker({ kind: 'MOVE', screen: { x: 0, y: 0 }, createdAtMs: 900 });

    runtime.pruneFeedbackMarkers(1000, 500);

    const markers = runtime.getSnapshot().feedbackMarkers;
    expect(markers).toHaveLength(1);
    expect(markers[0]!.createdAtMs).toBe(900);
  });

  it('pruneFeedbackMarkers is a no-op (no notify) when nothing needs dropping', () => {
    const runtime = createRtsViewportRuntime();
    const onChange = vi.fn();
    runtime.addFeedbackMarker({ kind: 'MOVE', screen: { x: 0, y: 0 }, createdAtMs: 900 });
    runtime.subscribe(onChange);

    runtime.pruneFeedbackMarkers(1000, 500);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('setCamera updates the camera viewport info', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setCamera({ anchor: { x: 5, z: 6 }, distanceM: 150 });
    expect(runtime.getSnapshot().camera).toEqual({ anchor: { x: 5, z: 6 }, distanceM: 150 });
  });

  it('requestJumpTo/consumeJumpToRequest hands off a one-shot request without notifying', () => {
    const runtime = createRtsViewportRuntime();
    const onChange = vi.fn();
    runtime.subscribe(onChange);

    expect(runtime.consumeJumpToRequest()).toBeNull();
    runtime.requestJumpTo(12, 34);
    expect(onChange).not.toHaveBeenCalled();
    expect(runtime.consumeJumpToRequest()).toEqual({ x: 12, z: 34 });
    expect(runtime.consumeJumpToRequest()).toBeNull();
  });

  it('subscribe returns an unsubscribe function', () => {
    const runtime = createRtsViewportRuntime();
    const onChange = vi.fn();
    const unsubscribe = runtime.subscribe(onChange);
    unsubscribe();
    runtime.setCamera({ anchor: { x: 0, z: 0 }, distanceM: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
