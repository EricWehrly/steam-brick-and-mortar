import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Include all tests (including live tests and performance tests)
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ],
    testTimeout: 30000, // Higher timeout for performance and live tests
    hookTimeout: 30000
  },
})
