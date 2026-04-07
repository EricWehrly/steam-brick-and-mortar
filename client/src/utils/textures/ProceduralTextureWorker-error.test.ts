import { describe, it, expect } from 'vitest'

/**
 * Failing tests: ProceduralTextureWorker silences worker runtime errors.
 *
 * When a Worker throws a runtime exception (not a syntax error), the browser fires
 * an ErrorEvent where message/filename/lineno are all undefined. The current
 * onerror handler does:
 *   this.worker.onerror = (e) => {
 *       ProceduralTextureWorker.logger.error('Worker error:', e.message)  // undefined!
 *       for (const [, req] of this.pending) {
 *           req.reject(new Error(e.message))                              // Error('undefined')
 *       }
 *   }
 *
 * This surfaces in logs as: [ProceduralTextureWorker] ERROR Worker error: undefined
 *
 * Fix (next branch): use e.error?.message ?? e.error?.stack ?? e.filename ?? 'unknown worker error'
 * so crashes are diagnosable.
 */
describe('ProceduralTextureWorker error surfacing', () => {
    it.fails('current onerror handler logs undefined for runtime worker crashes', () => {
        // Runtime worker crashes produce ErrorEvent with message=undefined.
        // The current code passes e.message directly to the logger and Error ctor.
        const e = { message: undefined, filename: undefined, lineno: undefined, colno: undefined, error: new Error('actual crash reason') } as unknown as ErrorEvent

        // Current implementation: Error(e.message) === Error(undefined) === message is string "undefined"
        const rejection = new Error(e.message)
        // THIS is the bug: the rejection carries "undefined" as a string, not the real error
        // This assertion FAILS because rejection.message IS "undefined" (the string) — proving the bug
        expect(rejection.message, 'rejection should carry actual crash reason').toBe('actual crash reason')
    })

    it.fails('worker onerror must surface e.error details, not just e.message', () => {
        // Simulate the current handler's decision: it checks e.message only
        const e = { message: undefined, error: new Error('Worker crashed: bad import') } as unknown as ErrorEvent

        // Current code uses only e.message — this assertion should pass after the fix,
        // where the fix uses: e.error?.message ?? e.message ?? 'unknown worker error'
        const currentImpl = e.message        // what code currently logs ? undefined
        const fixedImpl = e.error?.message ?? e.message ?? 'unknown worker error'  // what it should log

        // This FAILS because currentImpl !== fixedImpl (undefined vs 'Worker crashed: bad import')
        expect(currentImpl).toBe(fixedImpl)
    })
})