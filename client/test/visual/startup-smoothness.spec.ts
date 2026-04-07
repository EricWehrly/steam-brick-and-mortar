import { test, expect } from '@playwright/test'
import { writeFile, mkdir } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { attachConsoleCollector } from './helpers/scene'

/**
 * Startup Smoothness Test
 * 
 * 1. Navigates to localhost:5173
 * 2. Collects console messages for 15s (startup period)
 * 3. Counts "Main Thread Hitch Detected" messages
 * 4. Captures startup phase timings from "[StartupTracker] Phase X took Yms" messages
 * 5. Saves result to test-results/startup-smoothness.json
 * 6. Asserts hitch count < 5
 * 
 * Run: yarn test:visual --grep "startup smoothness"
 */
test('startup smoothness', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  // 1. Navigate to the app
  await page.goto('/')

  // 2. Wait for 15 seconds to collect startup period data
  await page.waitForTimeout(15000)

  // 3. Count hitch messages
  const hitches = entries.filter(e => e.text.includes('Main Thread Hitch Detected'))
  const hitchCount = hitches.length

  // 4. Capture startup phase timings
  // Look for: "[StartupTracker] Phase X took Yms"
  const phaseTimings: Record<string, number> = {}
  entries.forEach(e => {
    // Matches: [StartupTracker] Phase WorldBuild took 1500ms
    const match = e.text.match(/\[StartupTracker\] Phase (\w+) took (\d+)ms/)
    if (match) {
      const [, phase, duration] = match
      phaseTimings[phase] = parseInt(duration, 10)
    }
  })

  // 5. Save report
  const report = {
    timestamp: new Date().toISOString(),
    hitchCount,
    hitches: hitches.map(h => h.text),
    phaseTimings,
    summary: {
      totalHitches: hitchCount,
      totalPhasesTracked: Object.keys(phaseTimings).length
    }
  }

  const reportPath = await getResultPath('startup-smoothness.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2))

  // 6. Assertions & Output
  console.log('\n=== Startup Smoothness Report ===')
  console.log(`  Hitches detected: ${hitchCount}`)
  console.table(Object.entries(phaseTimings).map(([phase, ms]) => ({
    phase,
    'duration (ms)': ms
  })))
  
  if (hitches.length > 0) {
    console.log('HITCH DETAILS:')
    hitches.forEach(h => console.log(`  ${h.text}`))
  }

  // Loose bound - currently seeing ~1-2
  expect(hitchCount).toBeLessThan(5)
  console.log(`\nFull report: ${reportPath}`)
})
