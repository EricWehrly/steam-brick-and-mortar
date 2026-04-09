import { test } from '@playwright/test'
import { writeFile } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { waitForSceneReady } from './helpers/scene'
import type { DrawCallReport } from '../../src/debug/SceneManagerDebug'
import { drawCallReportToMarkdown } from '../../src/debug/SceneManagerDebug'

/**
 * Draw Call Report
 *
 * Navigates to the app, waits for scene ready, then calls
 * window.sceneManager.drawCallReport() — the canonical way to get draw call
 * data without coupling Playwright to scene internals.
 *
 * Output: test-results/draw-call-report.md + draw-call-report.json
 *
 * Run: yarn test:visual --grep "draw call report"
 */
test('draw call report', async ({ page }) => {
  await page.goto('/')
  await waitForSceneReady(page, 30000, 5000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report = await page.evaluate(() => (window as any).sceneManager?.drawCallReport() as DrawCallReport | undefined)

  if (!report) {
    throw new Error('window.sceneManager.drawCallReport is not defined — is SceneManagerDebug wired up?')
  }

  // Build markdown table
  const md = drawCallReportToMarkdown(report)
  const mdPath = await getResultPath('draw-call-report.md')
  const jsonPath = await getResultPath('draw-call-report.json')

  await Promise.all([
    writeFile(mdPath, md),
    writeFile(jsonPath, JSON.stringify(report, null, 2)),
  ])

  console.log('\n=== Draw Call Report ===')
  if (report.renderer) {
    const r = report.renderer
    console.log(`  Draw calls:    ${r.calls}`)
    console.log(`  Triangles:     ${r.triangles.toLocaleString()}`)
    console.log(`  Programs:      ${r.programs}`)
    console.log(`  Geometries:    ${r.geometries}`)
    console.log(`  Textures:      ${r.textures}`)
  }
  console.log(`  Scene objects: ${report.objects.length}`)
  console.log(`  Report:        ${mdPath}`)
})
