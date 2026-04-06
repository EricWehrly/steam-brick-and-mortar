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

  // Collect lightweight runtime metrics for budget tracking
  const browserMetrics = await (page as unknown as { metrics?: () => Promise<unknown> }).metrics?.() ?? null
  const runtimeMetrics = await page.evaluate(async () => {
    const perf = performance
    const memory = (perf as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory

    const sampleFrameDeltas = async (frames: number): Promise<number[]> => {
      const deltas: number[] = []
      return new Promise((resolve) => {
        let count = 0
        let prev = 0
        const step = (ts: number): void => {
          if (count === 0) {
            prev = ts
            count++
            requestAnimationFrame(step)
            return
          }
          deltas.push(ts - prev)
          prev = ts
          count++
          if (count <= frames) {
            requestAnimationFrame(step)
          } else {
            resolve(deltas)
          }
        }
        requestAnimationFrame(step)
      })
    }

    const deltas = await sampleFrameDeltas(120)
    const avgFrameMs = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1)
    const p95FrameMs = deltas.length > 0
      ? [...deltas].sort((a, b) => a - b)[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))]
      : 0

    return {
      memory: {
        usedJSHeapSize: memory?.usedJSHeapSize ?? null,
        totalJSHeapSize: memory?.totalJSHeapSize ?? null,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
      },
      frameTiming: {
        sampleCount: deltas.length,
        avgFrameMs,
        p95FrameMs,
      }
    }
  })

  // Always print summary to test output
  console.log('\n=== Startup Console Report ===')
  console.log(`  errors:   ${errors.length}`)
  console.log(`  warnings: ${warnings.length}`)
  console.log(`  info/log: ${info.length}`)
  console.log(`  debug:    ${debug.length}`)
  console.log(`  total:    ${entries.length}`)
  console.log(`  js heap used: ${(runtimeMetrics.memory.usedJSHeapSize ?? 0) / (1024 * 1024)} MB`)
  console.log(`  frame avg: ${runtimeMetrics.frameTiming.avgFrameMs.toFixed(2)}ms  p95: ${runtimeMetrics.frameTiming.p95FrameMs.toFixed(2)}ms`)

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
    budgets: {
      // Soft watch targets only (non-failing). Tune as we gather real baselines.
      jsHeapUsedMbTarget: 500,
      avgFrameMsTarget: 16,
      p95FrameMsTarget: 25,
    },
    runtimeMetrics,
    browserMetrics,
    errors,
    warnings,
    info,
    debug,
    all: entries,
  }

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/console-report.json', JSON.stringify(report, null, 2))
  await writeFile('test-results/perf-report.json', JSON.stringify({
    timestamp: report.timestamp,
    budgets: report.budgets,
    runtimeMetrics,
    browserMetrics,
  }, null, 2))
  console.log('\nFull report: test-results/console-report.json')
  console.log('Perf report: test-results/perf-report.json')
})
