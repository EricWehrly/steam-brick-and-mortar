import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Default config excludes live tests and performance tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/live/**',
      '**/performance/**'
    ]
  },
})
