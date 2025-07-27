import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Reduce output verbosity
    silent: false,
    reporters: ['basic'],
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
