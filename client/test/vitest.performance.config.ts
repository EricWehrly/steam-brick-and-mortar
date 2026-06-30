import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/performance/**/*.test.ts'],
    exclude: ['test/unit/**', 'test/integration/**', 'test/live/**', 'test/visual/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run performance tests serially to avoid resource conflicts
    pool: 'threads',
    fileParallelism: false,
    // TODO: replace 'verbose' with a custom reporter that writes per-test duration to
    // the JSON output file, then summaryReporter can be added here and to vitest.all.config.ts.
    reporters: ['verbose', 'json'],
    outputFile: 'test-results/performance-results.json'
  }
})
