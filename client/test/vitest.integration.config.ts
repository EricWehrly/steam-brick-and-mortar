import { defineConfig, mergeConfig } from 'vitest/config'
import { baseConfig } from './vitest.base'
import { createSummaryReporter } from './reporters/summary-reporter'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: '80%',
    reporters: [createSummaryReporter('./test-results/integration-results.json')],
    testTimeout: 35000,
    hookTimeout: 35000,
    include: [
      '**/integration/**/*.int.test.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ]
  },
}))
