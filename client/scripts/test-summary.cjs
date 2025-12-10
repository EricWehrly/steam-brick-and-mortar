#!/usr/bin/env node
/**
 * Parse vitest JSON output and show a summary focused on failures/issues
 * Usage: node scripts/test-summary.cjs [path-to-json]
 */

const fs = require('fs')
const path = require('path')

const jsonPath = process.argv[2] || './test-results/test-results.json'

if (!fs.existsSync(jsonPath)) {
    console.log('❌ No test results found at:', jsonPath)
    console.log('   Run: yarn test')
    process.exit(1)
}

const results = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

// Summary counts
let passed = 0, failed = 0, skipped = 0
const failures = []
const slow = []  // Tests > 5 seconds
const timeouts = []

// Vitest JSON format uses testResults array with assertionResults inside
for (const file of results.testResults || []) {
    const filePath = path.relative(process.cwd(), file.name).replace(/\\/g, '/')
    
    for (const test of file.assertionResults || []) {
        const duration = test.duration || 0
        const fullName = `${filePath} > ${test.fullName || test.title}`
        
        if (test.status === 'passed') {
            passed++
            if (duration > 5000) {
                slow.push({ name: fullName, duration })
            }
        } else if (test.status === 'failed') {
            failed++
            const error = test.failureMessages?.[0] || 'Unknown error'
            const isTimeout = error.toLowerCase().includes('timeout') || 
                             error.toLowerCase().includes('exceeded') ||
                             error.toLowerCase().includes('timed out')
            
            if (isTimeout) {
                timeouts.push({ name: fullName, error, duration })
            } else {
                failures.push({ name: fullName, error: error.split('\n')[0], duration })
            }
        } else if (test.status === 'skipped' || test.status === 'pending') {
            skipped++
        }
    }
}

// Output summary
console.log('\n' + '═'.repeat(60))
console.log('📊 TEST SUMMARY')
console.log('═'.repeat(60))
console.log(`✅ Passed:  ${passed}`)
console.log(`❌ Failed:  ${failed}`)
console.log(`⏭️  Skipped: ${skipped}`)
console.log('─'.repeat(60))

if (timeouts.length > 0) {
    console.log('\n⏰ TIMEOUTS:')
    for (const t of timeouts) {
        console.log(`  • ${t.name}`)
        console.log(`    ${t.error.substring(0, 100)}...`)
    }
}

if (failures.length > 0) {
    console.log('\n❌ FAILURES:')
    for (const f of failures) {
        console.log(`  • ${f.name}`)
        console.log(`    ${f.error.substring(0, 100)}`)
    }
}

if (slow.length > 0) {
    console.log('\n🐢 SLOW TESTS (>5s):')
    slow.sort((a, b) => b.duration - a.duration)
    for (const s of slow.slice(0, 10)) {
        console.log(`  • ${(s.duration/1000).toFixed(1)}s - ${s.name}`)
    }
    if (slow.length > 10) {
        console.log(`    ... and ${slow.length - 10} more slow tests`)
    }
}

if (failed === 0 && timeouts.length === 0) {
    console.log('\n✨ All tests passed!')
}

console.log('')
process.exit(failed > 0 ? 1 : 0)
