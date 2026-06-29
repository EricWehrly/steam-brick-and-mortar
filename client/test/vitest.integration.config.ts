import { defineConfig } from 'vitest/config'

export default defineConfig({
  maxWorkers: 4,
  minWorkers: 1,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
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
