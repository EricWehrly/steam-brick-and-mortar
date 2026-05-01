import { test } from '@playwright/test'
import { getResultPath } from './helpers/results'
import { waitForSceneReady, attachConsoleCollector } from './helpers/scene'

const screenshotName = process.env.PLAYWRIGHT_SCREENSHOT_NAME ?? 'screenshot-startup.png'
const screenshotSelector = process.env.PLAYWRIGHT_SCREENSHOT_SELECTOR
const preClickSelectors = (process.env.PLAYWRIGHT_PRECLICK_SELECTORS ?? '')
  .split(',')
  .map(selector => selector.trim())
  .filter(Boolean)
const postReadyWaitMs = Number(process.env.PLAYWRIGHT_POST_READY_WAIT_MS ?? '0')

/**
 * Screenshot capture tool.
 *
 * Not a pixel-diff regression test — a visual inspection tool.
 * Takes a screenshot after scene ready and saves it to test-results/
 * for human or vision-model review.
 *
 * Use this:
 *   - After a lighting/material/layout change to visually verify the result
 *   - To give vision analysis a "current state" image
 *   - As a before/after pair when refactoring visual systems
 *   - To capture a targeted UI region by setting PLAYWRIGHT_SCREENSHOT_SELECTOR
 *
 * Before/after pattern:
 *   - Run BEFORE editing:
 *       PLAYWRIGHT_SCREENSHOT_NAME=layout-sort-before.png
 *       PLAYWRIGHT_SCREENSHOT_SELECTOR=.layout-sort-controls
 *       yarn test:visual --grep "screenshot"
 *   - Run AFTER editing:
 *       PLAYWRIGHT_SCREENSHOT_NAME=layout-sort-after.png
 *       PLAYWRIGHT_SCREENSHOT_SELECTOR=.layout-sort-controls
 *       yarn test:visual --grep "screenshot"
 *
 * Optional variables:
 *   - PLAYWRIGHT_PRECLICK_SELECTORS=#lighting-panel-header,.some-toggle
 *   - PLAYWRIGHT_POST_READY_WAIT_MS=800
 *
 * Run: yarn test:visual --grep "screenshot"
 */
test('screenshot: scene at startup', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')
  await waitForSceneReady(page, 45000, 20000)  // 20s settle — allows demo game batch + SwiftShader render

  for (const selector of preClickSelectors) {
    await page.locator(selector).click()
  }

  if (postReadyWaitMs > 0) {
    await page.waitForTimeout(postReadyWaitMs)
  }

  const screenshotPath = await getResultPath(screenshotName)
  if (screenshotSelector) {
    await page.locator(screenshotSelector).screenshot({ path: screenshotPath })
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: false })
  }
  console.log(`\nScreenshot saved: ${screenshotPath}`)

  // Also capture any errors that appeared alongside the screenshot
  const errors = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  if (errors.length > 0) {
    console.log('\nConsole errors during this run:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }
})
