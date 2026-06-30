import { defineConfig } from 'vitest/config'
import { createSummaryReporter } from './reporters/summary-reporter'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    env: { VITEST_LIVE: 'true' },
    watch: false,
    reporters: [createSummaryReporter('./test-results/live-results.json')],
    testTimeout: 30000,
    hookTimeout: 15000,
  },
})
