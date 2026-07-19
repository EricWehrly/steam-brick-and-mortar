import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/render-material-previews.ts'],
    watch: false,
    testTimeout: 60000,
  }
})
