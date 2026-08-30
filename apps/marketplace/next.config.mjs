import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * `@sonic-gameworld/spatial-engine/react` (DiscoveryGlobe, SpatialViewport, ...) is being built by a
 * concurrent agent and may not have a `dist/react.js` yet in this checkout. Its package.json already
 * declares the `"./react"` export subpath, so when the built file is missing, webpack's resolver hard-fails
 * with "Package path ./react is not exported" instead of a friendly runtime error — there is no way to
 * catch that from inside a `next/dynamic(() => import(...))` call, since it's a build-time resolution error.
 *
 * To keep this app buildable in that window (and to pick up the real component automatically the moment
 * spatial-engine ships it, with zero further changes here), we alias the subpath to a local shim — which
 * intentionally does NOT export `DiscoveryGlobe` — whenever the real compiled file isn't present yet.
 * `DiscoveryGlobeStage` (src/components/discovery/DiscoveryGlobeStage.tsx) treats a missing export as
 * "unavailable" and renders the 2D radial SVG fallback (`SpatialCanvas`) instead.
 */
function resolveSpatialEngineReactAlias() {
  try {
    const pkgDir = dirname(require.resolve('@sonic-gameworld/spatial-engine/package.json'));
    if (existsSync(join(pkgDir, 'dist', 'react.js'))) return undefined; // real build present — let it resolve normally
  } catch {
    // package itself not resolvable at all — fall through to the shim below
  }
  return join(__dirname, 'src/lib/spatialEngineReactShim.ts');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
      "@sonic-gameworld/world-schema",
      "@sonic-gameworld/events",
      "@sonic-gameworld/spatial-engine",
      "@sonic-gameworld/ui",
      "@sonic-gameworld/ai-sdk",
      "@sonic-gameworld/auth-sdk",
      "@sonic-gameworld/marketplace-sdk",
      "@sonic-gameworld/analytics-sdk",
      "@sonic-gameworld/asset-sdk",
      "@sonic-gameworld/gameworld-sdk"
  ],
  experimental: { optimizePackageImports: ['lucide-react'] },
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { canvas: 'canvas' }];
    // The codebase (and every @sonic-gameworld/* package) imports local modules
    // with explicit ".js" extensions (NodeNext/ESM style) even though the source
    // files are .ts/.tsx. TypeScript's "Bundler" moduleResolution understands
    // this, but Next's webpack does not by default — teach it the same alias.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    const shimPath = resolveSpatialEngineReactAlias();
    if (shimPath) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@sonic-gameworld/spatial-engine/react': shimPath,
      };
    }
    return config;
  },
};

export default nextConfig;
