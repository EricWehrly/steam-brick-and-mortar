import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from './vitest.base'
import { createSummaryReporter } from './reporters/summary-reporter'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    env: { VITEST_LIVE: 'true' },
    reporters: [createSummaryReporter('./test-results/live-results.json')],
    hookTimeout: 15000,
  },
}))
