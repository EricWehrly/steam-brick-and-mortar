/**
 * The summary reporter is what every `yarn test` run is read through, so it gets its own tests. The
 * case that matters most is a test file that fails to LOAD: it has no tests to count, and the
 * reporter once reported such a run as `FAILURES: 0` while whole suites silently never ran.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSummaryReporter } from '../../reporters/summary-reporter'

interface FakeTest { fullName: string; state: 'passed' | 'failed' | 'skipped'; message?: string }

function fakeModule(moduleId: string, tests: FakeTest[], loadErrors: Array<{ message: string }> = []) {
    return {
        moduleId,
        errors: () => loadErrors,
        children: {
            allTests: () => tests.map(test => ({
                fullName: test.fullName,
                result: () => ({ state: test.state, errors: test.message ? [{ message: test.message }] : [] }),
                diagnostic: () => ({ duration: 1 })
            }))
        }
    }
}

describe('summary reporter', () => {
    let outputDir: string
    let outputFile: string
    let printed: string[]

    beforeEach(() => {
        outputDir = mkdtempSync(join(tmpdir(), 'summary-reporter-'))
        outputFile = join(outputDir, 'results.json')
        printed = []
        vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { printed.push(args.join(' ')) })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        rmSync(outputDir, { recursive: true, force: true })
    })

    const run = (modules: unknown[], unhandledErrors?: unknown[]) =>
        createSummaryReporter(outputFile).onTestRunEnd(modules as never[], unhandledErrors as never[])
    const report = () => JSON.parse(readFileSync(outputFile, 'utf8'))

    it('reports a clean run as zero failures', () => {
        run([fakeModule('a.test.ts', [{ fullName: 'ok', state: 'passed' }, { fullName: 'later', state: 'skipped' }])])

        expect(printed[0]).toBe('FAILURES: 0')
        expect(printed.join('\n')).toContain('All tests passed!')
        expect(report().summary).toMatchObject({ passed: 1, failed: 0, skipped: 1 })
    })

    it('counts a failing test and names it', () => {
        run([fakeModule('a.test.ts', [{ fullName: 'breaks', state: 'failed', message: 'expected 1 to be 2' }])])

        expect(printed[0]).toBe('FAILURES: 1')
        expect(printed.join('\n')).toContain('FAIL: a.test.ts > breaks')
        expect(printed.join('\n')).not.toContain('All tests passed!')
    })

    it('counts a file that fails to load as a failure, rather than as nothing', () => {
        run([fakeModule('broken.test.ts', [], [{ message: 'vr-menu.css loaded empty' }])])

        expect(printed[0]).toBe('FAILURES: 1')
        expect(printed.join('\n')).toContain('FAIL: broken.test.ts > (file failed to load)')
        expect(printed.join('\n')).toContain('vr-menu.css loaded empty')
        expect(printed.join('\n')).not.toContain('All tests passed!')
        expect(report().summary.failed).toBe(1)
        expect(report().failures[0]).toMatchObject({ test: '(file failed to load)' })
    })

    it('records the load failure against the file in the per-file stats too', () => {
        run([fakeModule('broken.test.ts', [], [{ message: 'boom' }]), fakeModule('fine.test.ts', [{ fullName: 'ok', state: 'passed' }])])

        const files = report().files
        expect(files.find((f: { path: string }) => f.path.endsWith('broken.test.ts'))).toMatchObject({ passed: 0, failed: 1 })
        expect(files.find((f: { path: string }) => f.path.endsWith('fine.test.ts'))).toMatchObject({ passed: 1, failed: 0 })
    })

    it('counts every load error when a file has several', () => {
        run([fakeModule('broken.test.ts', [], [{ message: 'first' }, { message: 'second' }])])

        expect(printed[0]).toBe('FAILURES: 2')
    })

    it('counts unhandled errors thrown outside any test', () => {
        run([fakeModule('a.test.ts', [{ fullName: 'ok', state: 'passed' }])], [{ name: 'TypeError', message: 'stray rejection' }])

        expect(printed[0]).toBe('FAILURES: 1')
        expect(printed.join('\n')).toContain('FAIL: (unhandled error) > TypeError')
        expect(printed.join('\n')).toContain('stray rejection')
    })

    it('tolerates being called without the unhandled-errors argument', () => {
        expect(() => run([fakeModule('a.test.ts', [{ fullName: 'ok', state: 'passed' }])])).not.toThrow()
    })
})
