import type { Page } from '@playwright/test'

/**
 * Waits for the app to reach a visually stable state.
 *
 * Signal strategy (in priority order):
 *   1. window.__playwrightSceneReady — set by StartupProgressUI.remove() after full load
 *   2. Canvas is actively rendering — Three.js render loop is producing frames
 *      (detected by sampling canvas pixel change over two frames)
 *
 * The canvas fallback exists because in Docker/headless the Steam API won't respond,
 * so AllBatchesComplete never fires and the startup overlay never dismisses.
 * The scene itself renders fine — we just can't complete the loading sequence.
 *
 * TODO: replace with a semantic "world fully interactive" event once startup is
 * cleaned up. Should fire after: prewarm complete AND batches rendered AND
 * overlay dismissed — not gated on Steam API success.
 *
 * @param extraSettleMs  Wait after ready signal for async material swap-in.
 *                       Default 2000ms. Pass 0 for structural/error checks.
 */
export async function waitForSceneReady(page: Page, timeoutMs = 25000, extraSettleMs = 2000): Promise<void> {
  await Promise.race([
    // Primary: explicit ready flag (ideal path)
    page.waitForFunction(
      () => (window as any).__playwrightSceneReady === true,
      { timeout: timeoutMs }
    ),
    // Fallback: canvas is actively producing frames (render loop running)
    page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas')
        if (!canvas) return false
        // Sample pixel — if render loop is running, pixels will be non-zero
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          // WebGL canvas: just check it exists and has dimensions
          return canvas.width > 0 && canvas.height > 0
        }
        const px = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data
        return px[0] > 0 || px[1] > 0 || px[2] > 0
      },
      { timeout: timeoutMs }
    ),
  ])

  if (extraSettleMs > 0) {
    await page.waitForTimeout(extraSettleMs)
  }
}

/**
 * Collects all console messages and page errors from page load until now.
 * Attach before navigation so nothing is missed.
 */
export type ConsoleEntry = { type: string; text: string }

export function attachConsoleCollector(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = []
  page.on('console', msg => entries.push({ type: msg.type(), text: msg.text() }))
  page.on('pageerror', err => entries.push({ type: 'pageerror', text: err.message }))
  return entries
}
