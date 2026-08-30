import { defineConfig } from 'vitest/config';

// This app's tsconfig sets `"jsx": "preserve"` (Next.js's own SWC compiler does the JSX
// transform at build time) — vitest's default esbuild transform reads that same tsconfig and,
// finding "preserve", leaves JSX untransformed, which throws `ReferenceError: React is not
// defined` at test run time. Overriding esbuild's jsx mode here is scoped to the test runner only
// (Next's own build is untouched) — mirrors `packages/ui`'s `vitest.config.ts`, which gets the
// same result for free because that package's tsconfig already says `"jsx": "react-jsx"`.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node' },
});
