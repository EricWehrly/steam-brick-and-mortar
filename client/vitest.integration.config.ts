import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    watch: false,
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
