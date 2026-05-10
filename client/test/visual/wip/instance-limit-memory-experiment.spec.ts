// @ts-nocheck
import { test, expect } from '@playwright/test'
import { writeFile } from 'fs/promises'
import { getResultPath } from './helpers/results'
import { waitForSceneReady, attachConsoleCollector } from './helpers/scene'

type SaturationName = 'under' | 'exact' | 'over'

type MemorySnapshot = {
  timestamp?: string
  mainHeapMB?: number
  gpuEstimateMB?: number
  textureArrayCount?: number
  notes?: string[]
}

type ScenarioResult = {
  limit: number
  scenario: SaturationName
  targetCount: number
  sceneReady: boolean
  instancingSnapshot: {
    artworkRendererReady: boolean
    artworkInstanceCount: number
    artworkMetadataCount: number
    labelMetadataCount: number
  } | null
  placementSummary: {
    placedCount: number
    attemptedCount: number
    textureVariantCount: number
    prefetchFailures: number
    textureWritesSucceeded: number
    reusableSlotCount: number
    midTierDepth: number
  } | null
  hookExecuted: boolean
  hookStatus: string
  consoleWarnings: number
  snapshot: MemorySnapshot | null
}

const LIMITS = [100, 1000, 10000] as const

function getTargetCount(limit: number, scenario: SaturationName): number {
  if (scenario === 'under') return Math.max(1, Math.floor(limit * 0.8))
  if (scenario === 'exact') return limit
  return Math.ceil(limit * 1.2)
}

test.skip('WIP: instance limit saturation memory experiment (blocked)', async ({ browser }) => {
  test.setTimeout(240000)
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
  const scenarios: SaturationName[] = ['under', 'exact', 'over']
  const results: ScenarioResult[] = []

  for (const limit of LIMITS) {
    for (const scenario of scenarios) {
      const targetCount = getTargetCount(limit, scenario)
      const context = await browser.newContext()
      await context.addInitScript((placementLimit) => {
        ;(window as any).__sbmInstanceLimitOverrides = {
          placementCapacity: placementLimit,
          labelCapacity: Math.min(200, placementLimit),
        }
      }, limit)

      const page = await context.newPage()
      const consoleEntries = attachConsoleCollector(page)

      let sceneReady = false
      let instancingSnapshot: ScenarioResult['instancingSnapshot'] = null
      let placementSummary: ScenarioResult['placementSummary'] = null
      let saturationAttempt = { executed: false, status: 'not-attempted' }
      let snapshot: MemorySnapshot | null = null

      try {
        await page.goto(baseUrl)
        await waitForSceneReady(page, 15000, 250)
        sceneReady = true

        const hookResult = await page.evaluate(async ({ saturationScenario, saturationTarget }) => {
          const runScenario = (window as any).__sbmRunInstanceSaturationScenario
          if (typeof runScenario !== 'function') {
            return { executed: false, status: 'missing-window-hook', summary: null }
          }

          try {
            const summary = await runScenario({
              scenario: saturationScenario,
              targetCount: saturationTarget,
              textureVariantCount: 12,
              textureSize: 64,
            })
            return { executed: true, status: 'ok', summary }
          } catch (error) {
            return {
              executed: false,
              status: `hook-error:${error instanceof Error ? error.message : String(error)}`,
              summary: null,
            }
          }
        }, { saturationScenario: scenario, saturationTarget: targetCount })
        saturationAttempt = { executed: hookResult.executed, status: hookResult.status }
        placementSummary = hookResult.summary

        await page.waitForTimeout(300)
        instancingSnapshot = await page.evaluate(() => {
          const readSnapshot = (window as any).instancingSnapshot
          if (typeof readSnapshot !== 'function') {
            return null
          }
          return readSnapshot()
        })
        snapshot = await page.evaluate(() => (window as any).memorySnapshot?.() ?? null)
      } catch (error) {
        saturationAttempt = {
          executed: false,
          status: `scenario-error:${error instanceof Error ? error.message : String(error)}`,
        }
      }

      const consoleWarnings = consoleEntries.filter((entry) => entry.type === 'warning').length

      results.push({
        limit,
        scenario,
        targetCount,
        sceneReady,
        instancingSnapshot,
        placementSummary,
        hookExecuted: saturationAttempt.executed,
        hookStatus: saturationAttempt.status,
        consoleWarnings,
        snapshot,
      })

      await context.close()
    }
  }

  const outputPath = await getResultPath('instance-limit-memory-experiment.json')
  await writeFile(outputPath, JSON.stringify({ results }, null, 2))

  expect(results).toHaveLength(9)

  const hookExecutedCount = results.filter((result) => result.hookExecuted).length
  const readyScenarioCount = results.filter((result) => result.sceneReady).length
  const snapshotsCaptured = results.filter((result) => result.snapshot !== null).length
  const rendererReadyCount = results.filter((result) => result.instancingSnapshot?.artworkRendererReady).length
  const scenariosWithArtworkInstances = results.filter(
    (result) => (result.instancingSnapshot?.artworkInstanceCount ?? 0) > 0
  ).length
  const scenariosWithPlacedSyntheticInstances = results.filter(
    (result) => (result.placementSummary?.placedCount ?? 0) > 0
  ).length

  console.log(`Scene became ready for ${readyScenarioCount}/${results.length} scenarios`)
  console.log(`Snapshots captured for ${snapshotsCaptured}/${results.length} scenarios`)
  console.log(`Artwork renderer reported ready in ${rendererReadyCount}/${results.length} scenarios`)
  console.log(`Artwork instance count > 0 in ${scenariosWithArtworkInstances}/${results.length} scenarios`)
  console.log(`Synthetic placements > 0 in ${scenariosWithPlacedSyntheticInstances}/${results.length} scenarios`)
  console.log(`Instance saturation hook executed for ${hookExecutedCount}/${results.length} scenarios`)
  console.log(`Saved experiment report to ${outputPath}`)
})
