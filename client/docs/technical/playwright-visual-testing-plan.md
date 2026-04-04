# Playwright Visual & Log Testing — Implementation Plan

## Goal

Give me (Vex) two lightweight feedback loops that don't exist today:

1. **Visual regression** — before/after screenshots with vision analysis to catch rendering regressions (lighting, materials, geometry) without needing a human to manually eyeball the app
2. **Console log capture** — structured extraction of client-side logs during a test run, to support log cleanup work and catch unexpected errors/warnings

---

## Context & Constraints

- **Host:** Windows 10, WSL2 Docker backend (`linux x86_64`, Docker 29.0.1)
- **No discrete GPU in container** — WSL2 doesn't pass through GPU to Docker by default. NVIDIA Container Toolkit *can* work on WSL2 but requires WSL2 kernel ≥5.10.43 and nvidia-container-toolkit installed on the Windows host. This is worth checking but shouldn't block us.
- **Software rasterizer fallback is fine for our use case** — SwiftShader (Chromium's built-in CPU WebGL) renders Three.js scenes correctly, just slower. For screenshot diffs and log capture we don't need 60fps. Speed isn't the constraint — correctness is.
- **Playwright official Docker image** (`mcr.microsoft.com/playwright:v1.51.0-noble`) includes Chromium + all system deps. No nvidia-container-toolkit required for SwiftShader path.
- **App must be running** — tests hit `http://localhost:5173` (Vite dev server). The container needs to reach the host's Vite process. On Docker Desktop for Windows, `host.docker.internal` resolves to the host.

---

## Approach: Two-Tier

### Tier 1 — Local (no Docker, fast)

Run Playwright directly on Windows against the running dev server. Uses `--use-gl=egl` or `--use-angle=swiftshader` flags for WebGL in headless Chromium. No build step, no container spin-up. Good for iterative use during active development.

### Tier 2 — Docker (isolated, reproducible)

Run against a containerized Vite preview build (`vite build && vite preview`). No external dependencies, deterministic environment, same results every run. Good for "is the branch in a good visual state?" checks.

**Recommendation: Start with Tier 1.** Get tests written and validated locally first. Add Docker as a `test:visual:ci` target once the baseline screenshots exist.

---

## Phase 1 — Scaffold (do first)

### 1. Install Playwright

```bash
yarn add -D @playwright/test
yarn playwright install chromium
```

Add to `package.json`:
```json
"test:visual": "playwright test --config playwright.config.ts",
"test:visual:update": "playwright test --config playwright.config.ts --update-snapshots"
```

### 2. `playwright.config.ts` (project root)

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/visual',
  snapshotDir: './test/visual/__snapshots__',
  // Retry once on CI to reduce flake from timing
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    // Software WebGL — works headless without GPU passthrough
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
    // Consistent viewport for screenshot baselines
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Don't run visual tests as part of yarn test (Vitest)
  // Run explicitly with yarn test:visual
  webServer: undefined, // we manage Vite externally
})
```

### 3. Directory structure

```
test/
  visual/
    __snapshots__/       # baseline PNGs (committed to git)
    helpers/
      wait-for-scene.ts  # shared: waits for Three.js scene ready signal
    lighting.spec.ts
    console-logs.spec.ts
```

---

## Phase 2 — Test 1: Lighting Screenshot Comparison

**What it catches:** Ambient too dark/bright, missing lights, material color regression, black-screen startup issues.

**Mechanism:** App emits a custom event or sets `window.__sceneReady = true` when the scene is fully loaded. Playwright polls for this, then takes a screenshot and compares to baseline.

### App-side instrumentation needed

In `SteamBrickAndMortarApp.ts`, after `GameStart` event:

```ts
// After scene is ready and first frame rendered
if (import.meta.env.DEV) {
  window.__playwrightSceneReady = true
}
```

Or better — use the existing `StartupPhase.FullyLoaded` event:

```ts
eventManager.registerEventHandler(AppEventTypes.GameStart, () => {
  (window as any).__playwrightSceneReady = true
})
```

### `test/visual/helpers/wait-for-scene.ts`

```ts
import type { Page } from '@playwright/test'

export async function waitForSceneReady(page: Page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => (window as any).__playwrightSceneReady === true,
    { timeout: timeoutMs }
  )
  // Extra frame settle — Three.js render loop needs one more tick
  await page.waitForTimeout(200)
}
```

### `test/visual/lighting.spec.ts`

```ts
import { test, expect } from '@playwright/test'
import { waitForSceneReady } from './helpers/wait-for-scene'

test.describe('Lighting visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForSceneReady(page)
  })

  test('default store lighting matches baseline', async ({ page }) => {
    await expect(page).toHaveScreenshot('store-default-lighting.png', {
      maxDiffPixelRatio: 0.02, // 2% pixel tolerance for anti-aliasing variance
    })
  })

  test('lighting panel toggle does not black out scene', async ({ page }) => {
    // Open lighting controls panel
    await page.click('[data-testid="lighting-controls-toggle"]')
    await page.waitForTimeout(300) // panel animation
    await expect(page).toHaveScreenshot('store-lighting-panel-open.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
```

**First run:** `yarn test:visual:update` to generate baselines. Commit the PNGs. Subsequent runs diff against them.

---

## Phase 3 — Test 2: Console Log Capture

**What it catches:** Unexpected errors/warnings during startup, regressions in log noise, confirms cleanup work didn't break anything, surfaces issues I can't see from test output alone.

**Mechanism:** Playwright can intercept `page.on('console', ...)`. We collect all messages, bucket them by level, and assert/report.

### `test/visual/console-logs.spec.ts`

```ts
import { test, expect } from '@playwright/test'
import { waitForSceneReady } from './helpers/wait-for-scene'

test('startup console log report', async ({ page }) => {
  const logs: { type: string; text: string }[] = []

  page.on('console', msg => {
    logs.push({ type: msg.type(), text: msg.text() })
  })

  page.on('pageerror', err => {
    logs.push({ type: 'pageerror', text: err.message })
  })

  await page.goto('/')
  await waitForSceneReady(page)

  // Bucket by level
  const errors = logs.filter(l => l.type === 'error' || l.type === 'pageerror')
  const warnings = logs.filter(l => l.type === 'warning')
  const debugLogs = logs.filter(l => l.type === 'log')

  // Print structured report (shows in playwright output / CI logs)
  console.log('\n=== Startup Console Report ===')
  console.log(`Errors:   ${errors.length}`)
  console.log(`Warnings: ${warnings.length}`)
  console.log(`Logs:     ${debugLogs.length}`)

  if (errors.length > 0) {
    console.log('\nERRORS:')
    errors.forEach(e => console.log(` • [${e.type}] ${e.text}`))
  }
  if (warnings.length > 0) {
    console.log('\nWARNINGS:')
    warnings.forEach(w => console.log(` • ${w.text}`))
  }

  // Hard assertion: no JS errors on startup
  expect(errors, `Unexpected startup errors:\n${errors.map(e => e.text).join('\n')}`).toHaveLength(0)

  // Soft tracking: save full log to file for review
  const fs = await import('fs/promises')
  await fs.writeFile(
    'test-results/console-log-report.json',
    JSON.stringify({ timestamp: new Date().toISOString(), errors, warnings, logs }, null, 2)
  )
})
```

This doubles as our log cleanup diagnostic — run it before and after trimming log calls to see the delta.

---

## Phase 4 — Docker container (when ready for CI-style runs)

Add to `docker-compose.yml`:

```yaml
  playwright:
    image: mcr.microsoft.com/playwright:v1.51.0-noble
    working_dir: /app
    volumes:
      - ./client:/app
    environment:
      - CI=true
    extra_hosts:
      - "host.docker.internal:host-gateway"  # reach Vite on Windows host
    command: >
      sh -c "npm ci && npx playwright test --config playwright.config.ts"
    depends_on: []  # Vite runs on host, not in container
```

Run with: `docker compose run playwright`

**Note on GPU in Docker/WSL2:** NVIDIA Container Toolkit for WSL2 is possible but involves installing `nvidia-container-toolkit` on the Windows host and enabling `[wsl2] gpuSupport=true` in `.wslconfig`. SwiftShader makes this optional — only worth pursuing if test performance becomes a problem.

---

## Vision Analysis Integration (the "dimly lit" use case)

Once screenshots exist, I can pass them to Claude vision between test runs:

```
Run test:visual → screenshot → attach to analysis turn → 
"Does this look correctly lit? Are materials rendering? Any obvious regressions vs last run?"
```

This doesn't need to be automated in Playwright itself — I can do it manually as part of a review step, or we can wire it into a cron/subagent flow later. The key is that the screenshots *exist and are deterministic* before we worry about how to analyze them.

---

## Implementation Order

1. `yarn add -D @playwright/test` + `yarn playwright install chromium`
2. Add `window.__playwrightSceneReady` signal to app (tiny, DEV-only)
3. Scaffold `test/visual/` with config + helpers
4. Write `console-logs.spec.ts` first — no baseline needed, immediately useful for log cleanup work
5. Write `lighting.spec.ts`, run `--update-snapshots` to generate baselines
6. Commit baselines
7. Docker setup when/if needed

**Estimated scope:** ~2-3 hours of focused work. The console log test alone is worth doing today given we're about to work on log cleanup.
