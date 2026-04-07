import { test } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { waitForSceneReady, attachConsoleCollector } from './helpers/scene'

/**
 * Shelf rotation diagnostic test.
 *
 * Captures log lines related to shelf placement so we can confirm:
 *   - ShelfCreated events fire with correct rowIndex + shelfRotationY
 *   - GPU matrices are actually being updated after placement
 *
 * Run: yarn test:visual --grep "shelf rotation"
 *
 * NOTE: No Steam API in headless — shelves may not fully populate.
 * The goal is to capture the structural log trace, not full visual output.
 */
test('shelf rotation: log trace', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')
  await waitForSceneReady(page, 25000, 5000)

  // Pull shelf-related logs
  const shelfLogs = entries.filter(e =>
    e.text.includes('Set shelf unit') ||
    e.text.includes('ShelfCreated') ||
    e.text.includes('rowIndex') ||
    e.text.includes('shelfRotationY') ||
    e.text.includes('GPU updated') ||
    e.text.includes('Shelf layout determined') ||
    e.text.includes('shelf-layout') ||
    e.text.includes('InstancedShelfRenderer') ||
    e.text.includes('createInstancedShelf') ||
    e.text.includes('[SHELF-DEBUG]')
  )

  console.log(`\n=== Shelf Rotation Log Trace ===`)
  console.log(`Total captured: ${shelfLogs.length} shelf-related entries`)
  shelfLogs.forEach(e => console.log(`  [${e.type}] ${e.text}`))

  const errors = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  if (errors.length > 0) {
    console.log('\nErrors during run:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }

  const logPath = await getResultPath('shelf-rotation-log.json')
  await writeFile(
    logPath,
    JSON.stringify({ timestamp: new Date().toISOString(), shelfLogs, errors, all: entries }, null, 2)
  )
  console.log(`Full trace: ${logPath}`)
})
