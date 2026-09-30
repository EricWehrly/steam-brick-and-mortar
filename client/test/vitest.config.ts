import { defineConfig } from 'vitest/config'
import { RAW_STYLESHEET_CSS } from './vitest.shared'
import { createSummaryReporter } from './reporters/summary-reporter'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    css: RAW_STYLESHEET_CSS,
    setupFiles: ['./test/setup.ts'],
    watch: false,
    pool: 'threads',
    maxWorkers: '80%',
    reporters: [createSummaryReporter('./test-results/test-results.json')],
    testTimeout: 30000,
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
})
