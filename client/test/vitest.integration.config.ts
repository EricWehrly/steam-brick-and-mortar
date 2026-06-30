import { defineConfig } from 'vitest/config'
import { createSummaryReporter } from './reporters/summary-reporter'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
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
})
