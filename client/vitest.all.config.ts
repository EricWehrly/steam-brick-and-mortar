import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Include all tests (including live tests)
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ]
  },
})
