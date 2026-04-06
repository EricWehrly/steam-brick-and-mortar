#!/usr/bin/env node
/**
 * append-perf-history.cjs
 *
 * Reads test-results/perf-report.json and appends a one-line summary row
 * to docs/perf/perf-history.md.
 *
 * Called automatically by `yarn test:visual:perf` after Playwright runs.
 * Safe to run multiple times — skips duplicate rows (same timestamp).
 */

const fs = require('fs')
const path = require('path')

const reportPath = path.resolve(__dirname, '../test-results/perf-report.json')
const historyDir = path.resolve(__dirname, '../../docs/perf')
const historyPath = path.join(historyDir, 'perf-history.md')

if (!fs.existsSync(reportPath)) {
  console.error(`[perf-history] No report found at ${reportPath}. Run the visual test first.`)
  process.exit(0)
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const { timestamp, runtimeMetrics, budgets } = report

const heapMb = runtimeMetrics?.memory?.usedJSHeapSize != null
  ? (runtimeMetrics.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
  : 'n/a'
const avgMs = runtimeMetrics?.frameTiming?.avgFrameMs?.toFixed(2) ?? 'n/a'
const p95Ms = runtimeMetrics?.frameTiming?.p95FrameMs?.toFixed(2) ?? 'n/a'

// Build a branch/context label from git if available
let branchLabel = ''
try {
  const { execSync } = require('child_process')
  branchLabel = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
} catch (_) {
  branchLabel = 'unknown'
}

const date = new Date(timestamp).toISOString().split('T')[0]
const row = `| ${date} | ${branchLabel} | ${heapMb} MB | ${avgMs} ms | ${p95Ms} ms |`

// Create history file if it doesn't exist
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true })
}

const header = `# Perf History

Automatically appended by \`yarn test:visual:perf\` after each Playwright run.

| Date | Branch | JS Heap Used | Avg Frame | p95 Frame |
|------|--------|-------------|-----------|-----------|
`

if (!fs.existsSync(historyPath)) {
  fs.writeFileSync(historyPath, header)
}

const existing = fs.readFileSync(historyPath, 'utf8')

// Skip if this exact timestamp row already exists
if (existing.includes(row)) {
  console.log(`[perf-history] Row already recorded for ${date}, skipping.`)
  process.exit(0)
}

fs.appendFileSync(historyPath, row + '\n')
console.log(`[perf-history] Appended: ${row}`)

// Print budget status
if (budgets) {
  const heapWarn = runtimeMetrics?.memory?.usedJSHeapSize != null &&
    runtimeMetrics.memory.usedJSHeapSize / (1024 * 1024) > budgets.jsHeapUsedMbTarget
  const avgWarn = runtimeMetrics?.frameTiming?.avgFrameMs != null &&
    runtimeMetrics.frameTiming.avgFrameMs > budgets.avgFrameMsTarget
  const p95Warn = runtimeMetrics?.frameTiming?.p95FrameMs != null &&
    runtimeMetrics.frameTiming.p95FrameMs > budgets.p95FrameMsTarget

  if (heapWarn || avgWarn || p95Warn) {
    console.warn(`[perf-history] ⚠ Budget warnings:`)
    if (heapWarn) console.warn(`  heap: ${heapMb} MB > ${budgets.jsHeapUsedMbTarget} MB target`)
    if (avgWarn)  console.warn(`  avg frame: ${avgMs} ms > ${budgets.avgFrameMsTarget} ms target`)
    if (p95Warn)  console.warn(`  p95 frame: ${p95Ms} ms > ${budgets.p95FrameMsTarget} ms target`)
  } else {
    console.log(`[perf-history] ✓ All budgets nominal.`)
  }
}
