import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    // `@sonic-gameworld/rts-sim` was purely a type-only import until `src/rts/syncEntities.ts`
    // started calling its `getTeamColor`/`isNavalUnit` helpers at runtime (RTS geometry-bucket +
    // team-color tinting) — externalize it exactly like `three`/`react` rather than bundling its
    // compiled JS into `dist/index.js`; it's already a normal workspace dependency (package.json),
    // so every consumer already resolves it from node_modules at runtime regardless.
    external: ['react', 'react-dom', 'react/jsx-runtime', 'three', '@sonic-gameworld/rts-sim'],
  },
  {
    entry: { react: 'src/react/index.tsx' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'three', '@sonic-gameworld/rts-sim', '@sonic-gameworld/spatial-engine'],
    banner: { js: "'use client';" },
  },
]);
