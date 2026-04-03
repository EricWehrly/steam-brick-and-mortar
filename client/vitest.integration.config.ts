import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
    // Reduce output verbosity
    silent: false,
    reporters: ['default'],
    testTimeout: 35000,
    hookTimeout: 35000,
    // Integration tests only
    include: [
      '**/integration/**/*.int.test.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ]
  },
})
