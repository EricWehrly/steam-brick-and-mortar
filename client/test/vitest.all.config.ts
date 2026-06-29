import { defineConfig } from 'vitest/config'

export default defineConfig({
  maxWorkers: 4,
  minWorkers: 1,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Include unit + integration + performance tests.
    // Live tests hit real external APIs: run explicitly via yarn test:live
    // Visual/Playwright tests are opt-in tools: run explicitly via yarn test:visual
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**',
      '**/visual/**'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
