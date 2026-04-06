#!/usr/bin/env node
/**
 * append-perf-history.cjs
 *
 * Reads test-results/perf-report.json and appends a one-line summary row
 * to docs/perf/perf-history.md.
 *
 * Run after the visual perf test:
 *   npx playwright test --grep "console log report" && node scripts/append-perf-history.cjs
 *
 * Safe to run multiple times — skips rows with the same timestamp.
 */

const fs = require('fs')
const path = require('path')

const reportPath = path.resolve(__dirname, '../test-results/perf-report.json')
const historyDir  = path.resolve(__dirname, '../../docs/perf')
const historyPath = path.join(historyDir, 'perf-history.md')

if (!fs.existsSync(reportPath)) {
  console.error(`[perf-history] No report at ${reportPath}. Run the visual test first.`)
  process.exit(0)
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const { timestamp, runtimeMetrics, budgets } = report

const heapMb = runtimeMetrics?.memory?.usedJSHeapSize != null
  ? (runtimeMetrics.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1) + ' MB'
  : 'n/a'
const avgMs  = runtimeMetrics?.frameTiming?.avgFrameMs != null
  ? runtimeMetrics.frameTiming.avgFrameMs.toFixed(2) + ' ms'
  : 'n/a'
const p95Ms  = runtimeMetrics?.frameTiming?.p95FrameMs != null
  ? runtimeMetrics.frameTiming.p95FrameMs.toFixed(2) + ' ms'
  : 'n/a'

let branch = 'unknown'
try {
  const { execSync } = require('child_process')
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
} catch (_) {}

const date = new Date(timestamp).toISOString().split('T')[0]
const row  = `| ${date} | ${branch} | ${heapMb} | ${avgMs} | ${p95Ms} |`

if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true })

const header = [
  '# Perf History',
  '',
  'Appended by `node scripts/append-perf-history.cjs` after each visual perf capture.',
  '',
  '| Date | Branch | JS Heap Used | Avg Frame | p95 Frame |',
  '| ---- | ------ | -----------: | --------: | --------: |',
  '',
].join('\n')

if (!fs.existsSync(historyPath)) {
  fs.writeFileSync(historyPath, header)
}

const existing = fs.readFileSync(historyPath, 'utf8')

if (existing.includes(`| ${date} | ${branch} |`)) {
  console.log(`[perf-history] Row already recorded for ${date}/${branch}, skipping.`)
  process.exit(0)
}

// Insert before trailing blank line if present, otherwise just append
const lines = existing.trimEnd().split('\n')
const updated = [...lines, row, ''].join('\n') + '\n'
fs.writeFileSync(historyPath, updated)
console.log(`[perf-history] Appended: ${row}`)

// Budget summary
if (budgets) {
  const heapRaw = runtimeMetrics?.memory?.usedJSHeapSize
  const avgRaw  = runtimeMetrics?.frameTiming?.avgFrameMs
  const p95Raw  = runtimeMetrics?.frameTiming?.p95FrameMs

  const warns = [
    heapRaw != null && heapRaw / (1024*1024) > budgets.jsHeapUsedMbTarget
      ? `  heap: ${(heapRaw/(1024*1024)).toFixed(1)} MB > ${budgets.jsHeapUsedMbTarget} MB target`
      : null,
    avgRaw != null && avgRaw > budgets.avgFrameMsTarget
      ? `  avg frame: ${avgRaw.toFixed(2)} ms > ${budgets.avgFrameMsTarget} ms target`
      : null,
    p95Raw != null && p95Raw > budgets.p95FrameMsTarget
      ? `  p95 frame: ${p95Raw.toFixed(2)} ms > ${budgets.p95FrameMsTarget} ms target`
      : null,
  ].filter(Boolean)

  if (warns.length) {
    console.warn('[perf-history] ⚠ Budget warnings:')
    warns.forEach(w => console.warn(w))
  } else {
    console.log('[perf-history] ✓ All budgets nominal.')
  }
}
