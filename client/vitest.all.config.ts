import { defineConfig } from 'vitest/config'

export default defineConfig({
  maxWorkers: 4,
  minWorkers: 1,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Include all non-live tests (unit, integration, performance)
    // Live tests hit real external APIs and must be run explicitly via yarn test:live
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**'
    ],
    testTimeout: 30000, // Higher timeout for performance and live tests
    hookTimeout: 30000,

  },
})
