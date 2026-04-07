import { describe, it, expect } from 'vitest'
import { extractWorkerErrorMessage, makeWorkerErrorHandler, type PendingRequest } from './WorkerErrorUtils'

/**
 * Tests the shared worker error handling utilities.
 * These exist because browser ErrorEvents from runtime worker crashes have
 * message/filename/lineno all undefined. Logging only e.message produces
 * "[Worker] ERROR Worker error: undefined" with no actionable information.
 */
describe('extractWorkerErrorMessage', () => {
    it('returns e.error.message when the event has a real Error attached', () => {
        const e = { message: undefined, filename: undefined, error: new Error('Worker crashed: bad import') } as unknown as ErrorEvent
        expect(extractWorkerErrorMessage(e)).toBe('Worker crashed: bad import')
    })

    it('falls back to e.message when e.error is absent', () => {
        const e = { message: 'SyntaxError in worker', filename: undefined, error: undefined } as unknown as ErrorEvent
        expect(extractWorkerErrorMessage(e)).toBe('SyntaxError in worker')
    })

    it('falls back to filename:lineno when message and error are absent', () => {
        const e = { message: undefined, filename: 'worker.js', lineno: 42, error: undefined } as unknown as ErrorEvent
        const result = extractWorkerErrorMessage(e)
        expect(result).toContain('worker.js')
        expect(result).toContain('42')
    })

    it('returns descriptive fallback for fully undefined crash event (the common runtime case)', () => {
        const e = { message: undefined, filename: undefined, lineno: undefined, error: undefined } as unknown as ErrorEvent
        const result = extractWorkerErrorMessage(e)
        expect(result).toBeTruthy()
        expect(result).not.toBe('undefined')
        expect(result.length).toBeGreaterThan(5)
    })

    it('does NOT produce the string "undefined" for a runtime crash event', () => {
        // Original bug: new Error(e.message) where e.message === undefined
        // produced Error whose .message was the string "undefined"
        const e = { message: undefined, error: undefined } as unknown as ErrorEvent
        expect(extractWorkerErrorMessage(e)).not.toBe('undefined')
    })
})

describe('makeWorkerErrorHandler', () => {
    it('rejects all pending promises with a meaningful error message', () => {
        const pending = new Map<string, PendingRequest>()
        const rejections: Error[] = []
        pending.set('req-1', { reject: (e: Error) => rejections.push(e) })
        pending.set('req-2', { reject: (e: Error) => rejections.push(e) })

        const handler = makeWorkerErrorHandler('TestWorker', pending)
        const e = { message: undefined, filename: undefined, error: new Error('crash reason') } as unknown as ErrorEvent
        handler(e)

        expect(rejections).toHaveLength(2)
        expect(rejections[0].message).toContain('crash reason')
        expect(rejections[0].message).toContain('TestWorker')
        expect(rejections[0].message).not.toBe('undefined')
    })

    it('clears the pending map after crash', () => {
        const pending = new Map<string, PendingRequest>()
        pending.set('req-1', { reject: () => {} })

        const handler = makeWorkerErrorHandler('TestWorker', pending)
        handler({ message: undefined, error: undefined } as unknown as ErrorEvent)

        expect(pending.size).toBe(0)
    })

    it('calls the provided logger with worker name and error detail', () => {
        const logs: unknown[][] = []
        const logger = { error: (...args: unknown[]) => logs.push(args) }
        const pending = new Map<string, PendingRequest>()

        const handler = makeWorkerErrorHandler('MyWorker', pending, logger)
        handler({ message: undefined, error: new Error('details here') } as unknown as ErrorEvent)

        expect(logs).toHaveLength(1)
        const logLine = logs[0].join(' ')
        expect(logLine).toContain('MyWorker')
        expect(logLine).toContain('details here')
    })
})