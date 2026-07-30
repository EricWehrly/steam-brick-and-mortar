#!/usr/bin/env node
// Dedupes a noisy console/log dump: strips timestamps, line numbers, and volatile ids (long
// digit runs, decimal numbers, URL query/path segments), then groups by normalized pattern and
// prints counts descending. Generic - not coupled to this project's log format specifically,
// just tuned for the common "file.ts:LINE HH:MM:SS.mmm [Context] LEVEL message" console-log
// shape (this project's Logger.ts, but also common elsewhere) and for bare stack-trace lines
// ("functionName @ file.js:123") that DevTools console exports interleave with real messages -
// those are reported separately since they're rarely the thing worth reading top-to-bottom.
//
// Usage: node scripts/dedupe-log.js <path> [--top N] [--grep PATTERN] [--stack-top N]
const fs = require('fs')

const args = process.argv.slice(2)
const filePath = args[0]
const topIdx = args.indexOf('--top')
const top = topIdx !== -1 ? parseInt(args[topIdx + 1], 10) : 200
const grepIdx = args.indexOf('--grep')
const grepPattern = grepIdx !== -1 ? new RegExp(args[grepIdx + 1]) : null
const stackTopIdx = args.indexOf('--stack-top')
const stackTop = stackTopIdx !== -1 ? parseInt(args[stackTopIdx + 1], 10) : 5

if (!filePath) {
    console.error('Usage: node scripts/dedupe-log.js <path> [--top N] [--grep PATTERN] [--stack-top N]')
    process.exit(1)
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n')

// A line that's *only* a call-site reference, not a message - "funcName @ file.js:123",
// "await in (anonymous)" (V8's async-boundary marker), or a bare function name standing in for
// a native/async frame (e.g. "requestAnimationFrame"). DevTools console exports emit one of
// these per stack frame per logged call, so a handful of real warnings can produce vastly more
// of these than actual content. Reported as a separate summary instead of polluting the top-N list.
const STACK_FRAME_PATTERNS = [
    /^\(?[\w.$<>]*\)?\s*@\s*\S+:\d+(:\d+)?$/,
    /^await in .+$/,
    /^[\w$.]+$/,
]

function isStackFrameLine(line) {
    return STACK_FRAME_PATTERNS.some((pattern) => pattern.test(line))
}

function normalize(line) {
    return line
        // strip leading "file.ts:123 09:31:37.007 " style prefixes
        .replace(/^[\w.]+:\d+\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*/, '')
        // strip stack-frame-only lines' trailing line:column
        .replace(/:\d+:\d+\)?$/, '')
        // collapse decimal numbers (timings, coordinates, etc.) before the integer-run pass
        // below, so e.g. "16.70ms" and "17.80ms" both become "#ms" instead of two distinct
        // 2-digit tokens that dodge the \d{3,} threshold and fragment one message into many.
        // No trailing \b - a decimal run followed directly by a unit suffix ("16.70ms") has no
        // word boundary between digit and letter, so \b there would silently never match.
        .replace(/\d+\.\d+/g, '#')
        // collapse appids, frame counters, and other long digit runs
        .replace(/\b\d{3,}\b/g, '#')
        // collapse quoted URLs down to origin + path template (numeric ids already handled above)
        .replace(/'https?:\/\/[^']+'/g, (m) => {
            try {
                const u = new URL(m.slice(1, -1))
                return `'${u.origin}${u.pathname.replace(/\/#(?=\/|$)/g, '/#')}'`
            } catch {
                return m
            }
        })
        .trim()
}

const messageCounts = new Map()
const stackCounts = new Map()
let stackLineTotal = 0
let matchedTotal = 0

for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (grepPattern && !grepPattern.test(line)) continue
    matchedTotal++

    if (isStackFrameLine(line)) {
        stackLineTotal++
        const key = normalize(line)
        stackCounts.set(key, (stackCounts.get(key) || 0) + 1)
        continue
    }

    const key = normalize(line)
    messageCounts.set(key, (messageCounts.get(key) || 0) + 1)
}

const sortedMessages = [...messageCounts.entries()].sort((a, b) => b[1] - a[1])
const sortedStacks = [...stackCounts.entries()].sort((a, b) => b[1] - a[1])

console.log(
    `Total lines: ${lines.length}` +
    (grepPattern ? `, matching --grep: ${matchedTotal}` : '') +
    `, message patterns: ${sortedMessages.length}, stack-frame lines: ${stackLineTotal} (${sortedStacks.length} distinct call sites)\n`
)
for (const [pattern, count] of sortedMessages.slice(0, top)) {
    console.log(`${String(count).padStart(7)}  ${pattern}`)
}

if (sortedStacks.length > 0) {
    console.log(`\n-- stack-trace noise (top ${Math.min(stackTop, sortedStacks.length)} of ${sortedStacks.length} call sites, ${stackLineTotal} lines total) --`)
    for (const [pattern, count] of sortedStacks.slice(0, stackTop)) {
        console.log(`${String(count).padStart(7)}  ${pattern}`)
    }
}
