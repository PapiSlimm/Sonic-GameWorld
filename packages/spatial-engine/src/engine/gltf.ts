import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

let cachedLoaderPromise: Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader> | null = null;

/**
 * Lazily imports three's GLTFLoader (an "examples/jsm" addon, not part of the core `three` bundle) so
 * that packages which never load a GLB never pay for the extra code, and so this stays SSR-safe (the
 * dynamic import only resolves when actually invoked, i.e. in the browser).
 */
async function getLoader() {
  if (!cachedLoaderPromise) {
    cachedLoaderPromise = import('three/examples/jsm/loaders/GLTFLoader.js').then((mod) => new mod.GLTFLoader());
  }
  return cachedLoaderPromise;
}

const gltfCache = new Map<string, Promise<GLTF>>();

/** Loads (and caches by URL) a GLB/GLTF asset. Rejects on network/parse failure — callers should fall back gracefully. */
export function loadGLTF(url: string): Promise<GLTF> {
  let promise = gltfCache.get(url);
  if (!promise) {
    promise = getLoader().then(
      (loader) =>
        new Promise<GLTF>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }),
    );
    gltfCache.set(url, promise);
    promise.catch(() => gltfCache.delete(url));
  }
  return promise;
}

export function clearGLTFCache(): void {
  gltfCache.clear();
}
