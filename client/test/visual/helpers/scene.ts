import type { Page } from '@playwright/test'

/**
 * Waits for the Three.js scene to signal readiness.
 * The app sets window.__playwrightSceneReady = true after GameStart.
 */
export async function waitForSceneReady(page: Page, timeoutMs = 20000): Promise<void> {
  await page.waitForFunction(
    () => (window as any).__playwrightSceneReady === true,
    { timeout: timeoutMs }
  )
  // One extra tick for the render loop to produce a stable frame
  await page.waitForTimeout(300)
}

/**
 * Collects all console messages and page errors from page load until now.
 * Call after navigation + waitForSceneReady.
 */
export type ConsoleEntry = { type: string; text: string }

export function attachConsoleCollector(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = []
  page.on('console', msg => entries.push({ type: msg.type(), text: msg.text() }))
  page.on('pageerror', err => entries.push({ type: 'pageerror', text: err.message }))
  return entries
}
