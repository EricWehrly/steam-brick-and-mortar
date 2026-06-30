import { relative } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

interface FailedTest { file: string; test: string; error: string }
interface FileStats { path: string; passed: number; failed: number; skipped: number }
interface ReportData {
    summary: { timestamp: string; passed: number; failed: number; skipped: number }
    failures: FailedTest[]
    files: FileStats[]
}

function formatError(error: string): string {
    const lines = error.split('\n').filter(l => l.trim())
    const displayLines = lines.slice(0, 5)
    const atLine = lines.find(l => /^\s*at /.test(l))
    if (atLine && !displayLines.includes(atLine)) displayLines.push(atLine.trim())
    return displayLines.map(l => `    ${l.trim()}`).join('\n')
}

const SEP = '═'.repeat(60)
const DIV = '─'.repeat(60)

export function createSummaryReporter(outputFile = 'test-results/test-results.json') {
    return {
        onTestRunEnd(testModules: any[]): void {
            let passed = 0, failed = 0, skipped = 0
            const failures: FailedTest[] = []
            const timeouts: FailedTest[] = []
            const slow: Array<{ name: string; duration: number }> = []
            const files: FileStats[] = []

            for (const module of testModules) {
                const filePath = relative(process.cwd(), module.moduleId ?? '').replace(/\\/g, '/')
                const stats: FileStats = { path: filePath, passed: 0, failed: 0, skipped: 0 }

                for (const test of module.children.allTests()) {
                    const result = (test as any).result()
                    const name = `${filePath} > ${(test as any).fullName}`

                    if (result.state === 'passed') {
                        passed++
                        stats.passed++
                        const duration: number = (test as any).diagnostic()?.duration ?? 0
                        if (duration > 2000) slow.push({ name, duration })
                    } else if (result.state === 'failed') {
                        failed++
                        stats.failed++
                        const error: string = result.errors?.[0]?.message ?? 'Unknown error'
                        const entry: FailedTest = { file: filePath, test: (test as any).fullName, error }
                        if (/timeout|exceeded|timed out/i.test(error)) timeouts.push(entry)
                        else failures.push(entry)
                    } else if (result.state === 'skipped' || result.state === 'pending') {
                        skipped++
                        stats.skipped++
                    }
                }

                files.push(stats)
            }

            const report: ReportData = {
                summary: { timestamp: new Date().toISOString(), passed, failed, skipped },
                failures: [...timeouts, ...failures],
                files,
            }

            mkdirSync(dirname(outputFile), { recursive: true })
            writeFileSync(outputFile, JSON.stringify(report, null, 2))

            console.log(`FAILURES: ${failed}`)
            console.log(`\n${SEP}`)
            console.log('TEST SUMMARY')
            console.log(SEP)
            console.log(`Passed:  ${passed}`)
            console.log(`Failed:  ${failed}`)
            console.log(`Skipped: ${skipped}`)
            console.log(DIV)

            for (const t of timeouts) {
                console.log(`\nTIMEOUT: ${t.file} > ${t.test}`)
                console.log(formatError(t.error))
            }

            for (const f of failures) {
                console.log(`\nFAIL: ${f.file} > ${f.test}`)
                console.log(formatError(f.error))
            }

            if (slow.length > 0) {
                console.log('\nSLOW (>2s):')
                slow.sort((a, b) => b.duration - a.duration)
                for (const s of slow.slice(0, 10)) {
                    console.log(`  ${(s.duration / 1000).toFixed(1)}s  ${s.name}`)
                }
                if (slow.length > 10) console.log(`  ...and ${slow.length - 10} more`)
            }

            if (failed === 0 && timeouts.length === 0) console.log('\nAll tests passed!')
            console.log(`\nReport: ${outputFile}`)
            console.log('')
        }
    }
}
