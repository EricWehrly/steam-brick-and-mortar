import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from './vitest.base'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: '80%',
    // TODO: add summaryReporter here once performance tests have their own timing-aware
    // reporter that captures per-test duration to test-results/performance-results.json.
    // Until then, `yarn test:all` uses vitest's default reporter so perf timing is visible.
    //
    // Include unit + integration + performance tests.
    // Live tests hit real external APIs: run explicitly via yarn test:live
    // Visual/Playwright tests are opt-in tools: run explicitly via yarn test:visual
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**',
      '**/visual/**'
    ],
    hookTimeout: 30000,
  },
}))
