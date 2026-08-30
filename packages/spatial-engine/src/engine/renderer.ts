import * as THREE from 'three';
import type { RendererLike } from '../types.js';

/**
 * A do-nothing renderer used whenever there is no real WebGL surface to draw into: SSR, vitest/jsdom,
 * or a `<canvas>`-less headless engine instance. Scene graph, camera math, layers and selection all still
 * work — the engine is fully "framework/GPU agnostic" the way §11 asks for; only pixels are skipped.
 */
export class NullRenderer implements RendererLike {
  width = 1;
  height = 1;
  renderCalls = 0;
  domElement: RendererLike['domElement'];

  constructor(width = 1, height = 1) {
    this.width = width;
    this.height = height;
    this.domElement = {
      width,
      height,
      toDataURL: () => '',
    };
  }

  shadowMap = { enabled: false };

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.domElement.width = width;
    this.domElement.height = height;
  }

  setPixelRatio(): void {
    /* no-op */
  }

  getPixelRatio(): number {
    return 1;
  }

  render(): void {
    this.renderCalls += 1;
  }

  dispose(): void {
    /* no-op */
  }
}

export interface CreateRendererOptions {
  canvas?: HTMLCanvasElement;
  renderer?: RendererLike;
  width?: number;
  height?: number;
  pixelRatio?: number;
  antialias?: boolean;
  onError?: (err: unknown) => void;
}

const hasRealDom = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';

/** Try to build a real WebGLRenderer. Falls back to a NullRenderer for SSR, non-browser, or WebGL-less environments (jsdom). */
export function createRenderer(opts: CreateRendererOptions): RendererLike {
  if (opts.renderer) return opts.renderer;
  const width = opts.width ?? 1;
  const height = opts.height ?? 1;

  if (opts.canvas && hasRealDom()) {
    try {
      const ctx =
        opts.canvas.getContext('webgl2') ??
        opts.canvas.getContext('webgl') ??
        opts.canvas.getContext('experimental-webgl');
      if (!ctx) {
        return new NullRenderer(width, height);
      }
      const renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: opts.antialias ?? true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(opts.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
      renderer.setSize(width, height, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('outputColorSpace' in renderer) {
        (renderer as unknown as { outputColorSpace: THREE.ColorSpace }).outputColorSpace = THREE.SRGBColorSpace;
      }
      return renderer as unknown as RendererLike;
    } catch (err) {
      opts.onError?.(err);
      return new NullRenderer(width, height);
    }
  }
  return new NullRenderer(width, height);
}
