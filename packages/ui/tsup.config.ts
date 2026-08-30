import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Interactive components — these use hooks/DOM APIs and must be marked client-only.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    banner: { js: "'use client';" },
  },
  {
    // Server-safe: pure helpers and the Tailwind preset. No 'use client' banner, so Server
    // Components (and plain Node scripts) can import these without being pulled into the
    // client bundle. Import `cn`/`formatCents`/`formatCompact`/tokens from here, not from the
    // package root, when the call site isn't already a client component.
    entry: { utils: 'src/utils-entry.ts', 'tailwind-preset': 'src/tailwind-preset.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
]);
