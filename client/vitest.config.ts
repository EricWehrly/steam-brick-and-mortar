import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Reduce output verbosity
    silent: false,
    // Output both console and JSON for easy parsing
    reporters: ['default', 'json'],
    outputFile: './test-results/test-results.json',
    testTimeout: 30000,  // Generous ceiling for slow material/shelf generation tests
    hookTimeout: 15000,
    // Default config excludes live tests, performance tests, and integration tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**',
      '**/performance/**',
      '**/integration/**'
    ]
  },
})
