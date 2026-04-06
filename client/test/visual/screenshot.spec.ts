import { test } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import { waitForSceneReady, attachConsoleCollector } from './helpers/scene'

async function openLightingPanel(page: import('@playwright/test').Page): Promise<boolean> {
  const lightingButton = page.locator('#lighting-controls-button')
  if (!(await lightingButton.count())) return false
  if (!(await lightingButton.isVisible())) return false

  await lightingButton.click()

  const panel = page.locator('#lighting-controls-panel')
  await panel.waitFor({ state: 'visible', timeout: 5000 })

  const header = page.locator('#lighting-panel-header')
  if (await header.count()) {
    // Expand content for deterministic screenshots
    await header.click()
    await page.waitForTimeout(250)
  }

  return true
}

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

  await mkdir('test-results', { recursive: true })

  const screenshotPath = 'test-results/screenshot-startup.png'
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`\nScreenshot saved: ${screenshotPath}`)

  // Also capture any errors that appeared alongside the screenshot
  const errors = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  if (errors.length > 0) {
    console.log('\nConsole errors during this run:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }
})

/**
 * Targeted screenshot workflow for the current lighting controls panel.
 * Captures one whole-scene context image + one tight panel crop for before/after diffs.
 */
test('screenshot: lighting controls panel (targeted)', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')
  await waitForSceneReady(page, 25000, 12000)

  const opened = await openLightingPanel(page)

  await mkdir('test-results', { recursive: true })

  const contextPath = 'test-results/screenshot-lighting-panel-context.png'
  await page.screenshot({ path: contextPath, fullPage: false })

  if (opened) {
    const panel = page.locator('#lighting-controls-panel')
    const panelPath = 'test-results/screenshot-lighting-panel.png'
    await panel.screenshot({ path: panelPath })
    console.log(`\nLighting screenshots saved:\n  ${contextPath}\n  ${panelPath}`)
  } else {
    console.log(`\nLighting panel not available in this run; saved context only:\n  ${contextPath}`)
  }

  const errors = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  if (errors.length > 0) {
    console.log('\nConsole errors during this run:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }
})
