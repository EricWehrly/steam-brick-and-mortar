import { test } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import { waitForSceneReady, attachConsoleCollector, type ConsoleEntry } from './helpers/scene'

/**
 * Console log capture tool.
 *
 * Not a pass/fail regression test — a diagnostic tool.
 * Captures all console output during startup and writes a structured report to
 * test-results/console-report.json for inspection.
 *
 * Use this:
 *   - Before/after log cleanup work to measure noise reduction
 *   - After a refactor to spot unexpected errors/warnings
 *   - When debugging a startup issue without a browser open
 *
 * Run: yarn test:visual --grep "console log report"
 */
test('console log report', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')
  await waitForSceneReady(page)

  const errors   = entries.filter(e => e.type === 'error' || e.type === 'pageerror')
  const warnings = entries.filter(e => e.type === 'warning')
  const info     = entries.filter(e => e.type === 'log' || e.type === 'info')
  const debug    = entries.filter(e => e.type === 'debug')

  // Always print summary to test output
  console.log('\n=== Startup Console Report ===')
  console.log(`  errors:   ${errors.length}`)
  console.log(`  warnings: ${warnings.length}`)
  console.log(`  info/log: ${info.length}`)
  console.log(`  debug:    ${debug.length}`)
  console.log(`  total:    ${entries.length}`)

  if (errors.length > 0) {
    console.log('\nERRORS:')
    errors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }
  if (warnings.length > 0) {
    console.log('\nWARNINGS:')
    warnings.forEach(w => console.log(`  ${w.text}`))
  }

  // Write full report for later inspection
  const report = {
    timestamp: new Date().toISOString(),
    summary: { errors: errors.length, warnings: warnings.length, info: info.length, debug: debug.length, total: entries.length },
    errors,
    warnings,
    info,
    debug,
    all: entries,
  }

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/console-report.json', JSON.stringify(report, null, 2))
  console.log('\nFull report: test-results/console-report.json')
})
