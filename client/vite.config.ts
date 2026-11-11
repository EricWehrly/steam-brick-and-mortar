import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'

const packageName: string = JSON.parse(readFileSync('./package.json', 'utf-8')).name

/** Title-cased package name, e.g. "steam-brick-mortar" -> "Steam Brick Mortar". */
const appTitle = packageName.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')

const appTitlePlugin: Plugin = {
  name: 'app-title-from-package-name',
  transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('%APP_TITLE%', appTitle) }
}

export default defineConfig({
  plugins: [appTitlePlugin],
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
