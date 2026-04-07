import { test } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { waitForSceneReady, attachConsoleCollector } from './helpers/scene'

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
 *
 * Run: yarn test:visual --grep "screenshot"
 */
test('screenshot: scene at startup', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')
  await waitForSceneReady(page, 25000, 12000)  // 12s settle — allows material upserts to complete

  const screenshotPath = await getResultPath('screenshot-startup.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`\nScreenshot saved: ${screenshotPath}`)

  // Also capture any errors that appeared alongside the screenshot
  const errors = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  if (errors.length > 0) {
    console.log('\nConsole errors during this run:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }
})
