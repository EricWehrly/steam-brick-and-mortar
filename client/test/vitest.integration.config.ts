import { defineConfig } from 'vitest/config'
import { createSummaryReporter } from './reporters/summary-reporter'

export default defineConfig({
  maxWorkers: 4,
  minWorkers: 1,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
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
})
