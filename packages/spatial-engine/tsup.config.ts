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
    external: ['react', 'react-dom', 'react/jsx-runtime', 'three'],
  },
  {
    entry: { react: 'src/react/index.tsx' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'three', '@sonic-gameworld/spatial-engine'],
    banner: { js: "'use client';" },
  },
]);
