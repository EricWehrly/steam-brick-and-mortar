import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true, // Fail if port is occupied instead of auto-incrementing
    open: false,
    host: true,
    // Allow Docker containers to reach the dev server via host.docker.internal
    allowedHosts: ['host.docker.internal']
  },
  preview: {
    port: 3001,
    open: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
