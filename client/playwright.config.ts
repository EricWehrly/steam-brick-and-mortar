import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/visual',
  // Don't include visual tests in the normal vitest run
  // Run explicitly with: yarn test:visual
  snapshotDir: './test/visual/__snapshots__',
  retries: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Software WebGL via SwiftShader — works without GPU passthrough
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
