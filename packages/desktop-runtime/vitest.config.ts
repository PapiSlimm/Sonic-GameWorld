import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Booting a real embedded Postgres (initdb + start) and a real MinIO child process is
    // legitimately slow (a few seconds each) compared to unit tests elsewhere in the repo.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
