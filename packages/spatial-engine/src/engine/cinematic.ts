import type { CameraRig, CinematicSequence, ShotTransition } from '@sonic-gameworld/world-schema';

export interface CinematicTickResult {
  /** Set when a new shot became active this tick (the engine should call setCameraMode for it). */
  activatedShot?: { rig: CameraRig; transition: ShotTransition };
  fadeAlpha: number;
  finished: boolean;
}

export interface CinematicState {
  playing: boolean;
  sequenceId: string | null;
  shotIndex: number;
  fadeAlpha: number;
}

const FADE_WINDOW_S = 0.5;

/**
 * Drives a `CinematicSequence`'s shot list over time. Framework/render-agnostic: it just tracks which
 * shot should be active and a `fadeAlpha` (0..1, black-overlay opacity) for FADE/DISSOLVE transitions —
 * the engine applies the corresponding CameraRig via `setCameraMode` and the HUD renders the fade.
 */
export class CinematicPlayer {
  private sequence: CinematicSequence | null = null;
  private shotIndex = -1;
  private shotElapsed = 0;
  private playing = false;

  play(sequence: CinematicSequence): void {
    this.sequence = sequence;
    this.shotIndex = -1;
    this.shotElapsed = 0;
    this.playing = sequence.shots.length > 0;
  }

  stop(): void {
    this.playing = false;
    this.sequence = null;
    this.shotIndex = -1;
    this.shotElapsed = 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getState(): CinematicState {
    const shot = this.sequence?.shots[this.shotIndex];
    return {
      playing: this.playing,
      sequenceId: this.sequence?.id ?? null,
      shotIndex: Math.max(this.shotIndex, 0),
      fadeAlpha: this.playing ? this.computeFade(shot?.durationS ?? 0, shot?.transition ?? 'CUT') : 0,
    };
  }

  private computeFade(durationS: number, transition: ShotTransition): number {
    if (transition === 'CUT' || transition === 'WIPE') return 0;
    const inFade = Math.max(0, 1 - this.shotElapsed / FADE_WINDOW_S);
    const outFade = Math.max(0, 1 - (durationS - this.shotElapsed) / FADE_WINDOW_S);
    return Math.min(1, Math.max(inFade, outFade));
  }

  /** Resolves `rigId -> CameraRig` via `rigsById` — pass the currently-loaded world's `doc.cameras`. */
  tick(dt: number, rigsById: Map<string, CameraRig>): CinematicTickResult {
    if (!this.playing || !this.sequence) return { fadeAlpha: 0, finished: !this.sequence };
    let activatedShot: CinematicTickResult['activatedShot'];

    if (this.shotIndex === -1) {
      this.shotIndex = 0;
      this.shotElapsed = 0;
      const shot = this.sequence.shots[0];
      const rig = shot ? rigsById.get(shot.rigId) : undefined;
      if (shot && rig) activatedShot = { rig, transition: shot.transition };
    } else {
      this.shotElapsed += dt;
      const currentShot = this.sequence.shots[this.shotIndex];
      if (currentShot && this.shotElapsed >= currentShot.durationS) {
        this.shotIndex += 1;
        this.shotElapsed = 0;
        if (this.shotIndex >= this.sequence.shots.length) {
          this.playing = false;
          return { fadeAlpha: 0, finished: true };
        }
        const nextShot = this.sequence.shots[this.shotIndex];
        const rig = nextShot ? rigsById.get(nextShot.rigId) : undefined;
        if (nextShot && rig) activatedShot = { rig, transition: nextShot.transition };
      }
    }

    const shot = this.sequence.shots[this.shotIndex];
    const fadeAlpha = shot ? this.computeFade(shot.durationS, shot.transition) : 0;
    return { activatedShot, fadeAlpha, finished: false };
  }
}
