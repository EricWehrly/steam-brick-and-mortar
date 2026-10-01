import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from './vitest.base'
import { createSummaryReporter } from './reporters/summary-reporter'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: '80%',
    reporters: [createSummaryReporter('./test-results/test-results.json')],
    hookTimeout: 15000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**',
      '**/performance/**',
      '**/integration/**',
      '**/visual/**'
    ]
  },
}))
